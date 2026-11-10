import BackgroundTasks
import Foundation
import Observation
import ViejoVerdeCore

/// Manda a la planilla de Google lo que pasa en la app.
///
/// Todo evento se guarda primero en la cola local (Documents/outbox.json) y después se intenta mandar:
/// al registrarlo, al volver a la app y en segundo plano (BGAppRefreshTask). Si falla, queda en la cola
/// y se reintenta con backoff exponencial. Nunca bloquea la UI: todo corre en Tasks.
@MainActor
@Observable
final class Sincronizador {
    static let shared = Sincronizador()

    private(set) var bandeja: Bandeja
    private(set) var activada: Bool
    private(set) var configurada: Bool
    private(set) var enviando = false
    /// Texto de progreso de "Sincronizar todo".
    private(set) var progreso: String?

    @ObservationIgnored private var tareaReintento: Task<Void, Never>?

    nonisolated static let idTareaDeFondo = "com.tinto.viejoverde.sync"
    private static let claveActivada = "sincronizacion.activada"
    private static var archivo: URL { Almacen.carpeta.appendingPathComponent("outbox.json") }

    static var versionApp: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    private init() {
        bandeja = Self.leerBandeja()
        activada = UserDefaults.standard.bool(forKey: Self.claveActivada)
        configurada = Self.credenciales() != nil
    }

    // MARK: Configuración

    var urlGuardada: String? { Llavero.leer(.planillaURL) }

    /// Valida y guarda la URL del Web App y el token en el llavero.
    func guardarConfiguracion(url: String, token: String) -> String? {
        let u = url.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: u), parsed.scheme == "https", parsed.host == "script.google.com",
              u.hasSuffix("/exec") else {
            return "La URL tiene que ser la del Web App: https://script.google.com/macros/s/…/exec"
        }
        guard t.count >= 16 else { return "El token parece muy corto." }
        guard Llavero.guardar(u, en: .planillaURL), Llavero.guardar(t, en: .planillaToken) else {
            return "No pude guardar en el llavero."
        }
        configurada = true
        return nil
    }

    func borrarConfiguracion() {
        Llavero.borrar(.planillaURL)
        Llavero.borrar(.planillaToken)
        configurada = false
    }

    func cambiarActivada(_ valor: Bool) {
        activada = valor
        UserDefaults.standard.set(valor, forKey: Self.claveActivada)
        if valor { Task { await enviar(forzar: true) } }
    }

    private static func credenciales() -> (url: URL, token: String)? {
        guard let u = Llavero.leer(.planillaURL), let url = URL(string: u),
              let token = Llavero.leer(.planillaToken) else { return nil }
        return (url, token)
    }

    // MARK: Registrar

    /// Llamado por `Almacen.cambiar` después de guardar. Encola y manda sin esperar.
    func registrar(antes: Datos, despues: Datos, hoy: Date) {
        guard activada else { return }
        let app = Self.versionApp
        bandeja.encolar(Eventos.detectar(antes: antes, despues: despues, ahora: hoy, app: app))
        bandeja.encolar(plantas: Eventos.filasCambiadas(antes: antes, despues: despues, hoy: hoy))
        encolarEtapas(despues, hoy: hoy)
        guardarBandeja()
        Task { await enviar() }
    }

    /// Cambios de etapa nuevos y, una vez por día, la fila de cada planta (el Día de cultivo avanza solo).
    func revisar(_ datos: Datos, hoy: Date) {
        guard activada else { return }
        encolarEtapas(datos, hoy: hoy)
        let dia = Calendario.claveDia(hoy)
        if bandeja.ultimoRefrescoPlantas != dia {
            bandeja.encolar(plantas: datos.plantas.map { Eventos.fila($0, hoy: hoy) })
            bandeja.ultimoRefrescoPlantas = dia
        }
        guardarBandeja()
    }

    private func encolarEtapas(_ datos: Datos, hoy: Date) {
        let nuevas = Eventos.cambiosDeEtapa(datos, hoy: hoy, app: Self.versionApp)
            .filter { !bandeja.etapasEncoladas.contains($0.id) }
        guard !nuevas.isEmpty else { return }
        bandeja.encolar(nuevas)
        bandeja.etapasEncoladas.formUnion(nuevas.map(\.id))
        // La fila de la planta también cambia de etapa.
        let ids = Set(nuevas.compactMap(\.plantaID))
        bandeja.encolar(plantas: datos.plantas.filter { ids.contains($0.id.uuidString) }.map { Eventos.fila($0, hoy: hoy) })
    }

    /// Al volver a la app (o desde segundo plano): revisa etapas y manda lo pendiente sin esperar el backoff.
    /// `datos` es nil en modo ejemplo (no se mira nada, pero lo real pendiente se manda igual).
    func alVolver(_ datos: Datos?, hoy: Date) {
        if let datos { revisar(datos, hoy: hoy) }
        Task { await enviar(forzar: true) }
    }

    // MARK: Enviar

    struct Resumen {
        var agregados = 0
        var repetidos = 0
        var error: String?
    }

    /// Manda la cola por lotes hasta vaciarla o hasta el primer error.
    /// `forzar` ignora el backoff (volver a la app, botones de Ajustes, segundo plano).
    @discardableResult
    func enviar(forzar: Bool = false) async -> Resumen {
        var resumen = Resumen()
        guard activada, !enviando, !bandeja.vacia else { return resumen }
        guard let credenciales = Self.credenciales() else {
            resumen.error = "Falta la URL o el token."
            return resumen
        }
        guard forzar || bandeja.puedeEnviar(ahora: Date()) else { return resumen }

        enviando = true
        defer { enviando = false }
        while !bandeja.vacia {
            let lote = bandeja.lote()
            let cuerpo: Data
            do {
                cuerpo = try CuerpoSync.json(lote, token: credenciales.token)
            } catch {
                resumen.error = "No pude armar el envío."
                break
            }
            switch await ClienteSync.enviar(cuerpo, a: credenciales.url) {
            case .success(let r):
                bandeja.confirmar(lote, ahora: Date())
                guardarBandeja()
                resumen.agregados += r.agregados ?? 0
                resumen.repetidos += r.repetidos ?? 0
                if progreso != nil { progreso = "Enviando… quedan \(bandeja.pendientes) eventos" }
            case .failure(let e):
                bandeja.fallo(e.mensaje, ahora: Date())
                guardarBandeja()
                resumen.error = e.mensaje
                programarReintento()
                return resumen
            }
        }
        return resumen
    }

    /// Reintento automático mientras la app está abierta (el backoff dice cuándo).
    private func programarReintento() {
        tareaReintento?.cancel()
        guard let cuando = bandeja.proximoIntento else { return }
        tareaReintento = Task { [weak self] in
            let espera = max(cuando.timeIntervalSinceNow, 1)
            try? await Task.sleep(nanoseconds: UInt64(espera * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.enviar()
        }
    }

    // MARK: Botones de Ajustes

    func probarConexion() async -> String {
        guard let credenciales = Self.credenciales() else { return "Primero guardá la URL y el token." }
        guard let cuerpo = try? CuerpoSync.prueba(token: credenciales.token) else { return "No pude armar la prueba." }
        switch await ClienteSync.enviar(cuerpo, a: credenciales.url) {
        case .success: return "Conexión OK: la planilla responde y el token es correcto."
        case .failure(let e): return e.mensaje
        }
    }

    /// Manda todo el historial y la fila de cada planta. Como los IDs son estables, repetirlo no duplica nada.
    func sincronizarTodo(_ datos: Datos, hoy: Date) async -> String {
        guard configurada else { return "Primero guardá la URL y el token." }
        guard activada else { return "Activá la sincronización primero." }
        let app = Self.versionApp
        let historial = Eventos.historial(datos, hoy: hoy, app: app)
        bandeja.encolar(historial)
        bandeja.etapasEncoladas.formUnion(historial.filter { $0.tipo == .cambioEtapa }.map(\.id))
        bandeja.encolar(plantas: datos.plantas.map { Eventos.fila($0, hoy: hoy) })
        bandeja.ultimoRefrescoPlantas = Calendario.claveDia(hoy)
        guardarBandeja()

        progreso = "Enviando… quedan \(bandeja.pendientes) eventos"
        defer { progreso = nil }
        // Si justo había un envío en curso, se espera a que termine.
        while enviando { try? await Task.sleep(nanoseconds: 300_000_000) }
        let r = await enviar(forzar: true)
        if let error = r.error {
            return "Se cortó: \(error) Lo que faltó queda en la cola y se reintenta solo."
        }
        return "Listo: \(r.agregados) filas nuevas en Registro, \(r.repetidos) ya estaban."
    }

    // MARK: Segundo plano

    /// Se llama una sola vez, al arrancar la app (antes de que termine de lanzarse).
    nonisolated static func registrarTareaDeFondo() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: idTareaDeFondo, using: nil) { tarea in
            let trabajo = Task { @MainActor in
                let s = Sincronizador.shared
                s.programarSegundoPlano()
                if let datos = Almacen.datosReales() { s.revisar(datos, hoy: Date()) }
                let r = await s.enviar(forzar: true)
                tarea.setTaskCompleted(success: r.error == nil)
            }
            tarea.expirationHandler = { trabajo.cancel() }
        }
    }

    /// Pide a iOS que despierte la app en un rato para mandar lo pendiente y detectar cambios de etapa.
    func programarSegundoPlano() {
        guard activada else { return }
        let pedido = BGAppRefreshTaskRequest(identifier: Self.idTareaDeFondo)
        pedido.earliestBeginDate = Date(timeIntervalSinceNow: bandeja.vacia ? 6 * 3600 : 15 * 60)
        try? BGTaskScheduler.shared.submit(pedido)
    }

    // MARK: Disco

    private func guardarBandeja() {
        guard let json = try? bandeja.json() else { return }
        // Sin .completeFileProtection: en segundo plano el teléfono puede estar bloqueado.
        try? json.write(to: Self.archivo, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private static func leerBandeja() -> Bandeja {
        guard let data = try? Data(contentsOf: archivo) else { return Bandeja() }
        if let b = try? Bandeja.leer(data) { return b }
        // No se pisa un archivo roto: se guarda una copia por si hay que recuperarlo.
        let copia = archivo.deletingPathExtension().appendingPathExtension("roto-\(Int(Date().timeIntervalSince1970)).json")
        try? FileManager.default.copyItem(at: archivo, to: copia)
        return Bandeja()
    }
}
