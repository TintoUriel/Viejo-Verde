import Foundation
import Observation
import ViejoVerdeCore

/// Estado de la app. Guarda todo en Documents/datos.json (escritura atómica) después de cada cambio.
/// El modo ejemplo usa otro archivo (ejemplo.json) y nunca toca los datos reales.
@MainActor
@Observable
final class Almacen {
    private(set) var datos: Datos
    private(set) var modoEjemplo = false
    private(set) var ultimoError: String?
    /// "Hoy" de la app. Se refresca al volver a abrirla, para que las tareas cambien de día.
    private(set) var hoy = Date()
    /// Pronóstico de CABA (Open-Meteo). Puede ser nil si nunca hubo internet.
    private(set) var clima: Pronostico?
    /// Chat con el asistente (se guarda aparte, en chat.json).
    private(set) var chat: [MensajeChat] = []

    @ObservationIgnored private var tareaAvisos: Task<Void, Never>?

    private static let archivoReal = "datos.json"
    private static let archivoEjemplo = "ejemplo.json"

    static var carpeta: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    private var archivo: URL {
        Self.carpeta.appendingPathComponent(modoEjemplo ? Self.archivoEjemplo : Self.archivoReal)
    }

    init() {
        let (d, error) = Self.leer(Self.carpeta.appendingPathComponent(Self.archivoReal))
        datos = d
        ultimoError = error
        clima = ServicioClima.cache()
        chat = Self.leerChat(Self.carpeta.appendingPathComponent("chat.json"))
    }

    var tareas: [Tarea] {
        Tareas.generar(plantas: datos.plantas, paquetes: datos.paquetes, hoy: hoy,
                       config: datos.config, pospuestas: datos.pospuestas, clima: climaVigente)
    }

    /// El pronóstico solo sirve si es de hoy o ayer.
    var climaVigente: Pronostico? {
        guard let c = clima, c.dia(hoy) != nil else { return nil }
        return c
    }

    var avisosClima: [AvisoClima] { AnalisisClima.avisos(climaVigente, plantas: datos.plantas, hoy: hoy) }

    /// Baja el pronóstico si el que hay es viejo.
    func actualizarClima(forzar: Bool = false) async {
        if !forzar, let c = clima, Date().timeIntervalSince(c.actualizado) < ServicioClima.vigencia { return }
        if let nuevo = await ServicioClima.descargar() {
            clima = nuevo
            programarAvisos()
        }
    }

    var cupo: ResumenCupo { Cupo.resumen(datos.plantas, hoy: hoy) }

    func estado(de planta: Planta) -> EstadoEtapa { Etapas.estado(de: planta, hoy: hoy) }

    /// Al volver a la app: actualiza el día y reprograma los avisos.
    func alVolver() {
        hoy = Date()
        programarAvisos(inmediato: true)
        Task { await actualizarClima() }
    }

    /// Única puerta para modificar datos: aplica el cambio y guarda.
    func cambiar(_ cambio: (inout Datos) -> Void) {
        hoy = Date()
        cambio(&datos)
        guardar()
    }

    /// Reemplaza todo (importar backup).
    func reemplazarTodo(con nuevos: Datos) {
        datos = nuevos
        guardar()
    }

    /// Borra todos los datos y las fotos.
    func borrarTodo() {
        if !modoEjemplo { Fotos.borrarTodas() }
        datos = Datos()
        guardar()
    }

    func borrarPlanta(_ id: UUID) {
        if let p = datos.planta(id) { p.fotos.forEach(Fotos.borrar) }
        cambiar { $0.borrarPlanta(id) }
    }

    // MARK: Modo ejemplo

    func entrarModoEjemplo() {
        modoEjemplo = true
        datos = Ejemplo.datos(hoy: Date())
        guardar()
        chat = Self.leerChat(archivoChat)
    }

    func salirModoEjemplo() {
        try? FileManager.default.removeItem(at: archivo)
        modoEjemplo = false
        let (d, error) = Self.leer(archivo)
        datos = d
        ultimoError = error
        chat = Self.leerChat(archivoChat)
        programarAvisos(inmediato: true)
    }

    // MARK: Avisos

    /// Reprograma las notificaciones (con una pequeña espera para agrupar cambios seguidos).
    func programarAvisos(inmediato: Bool = false) {
        // Con datos de ejemplo no se toca nada: los avisos reales quedan como estaban.
        guard !modoEjemplo else { return }
        tareaAvisos?.cancel()
        let copia = datos
        let pronostico = climaVigente
        tareaAvisos = Task {
            if !inmediato { try? await Task.sleep(nanoseconds: 800_000_000) }
            guard !Task.isCancelled else { return }
            await Notificaciones.reprogramar(copia, clima: pronostico)
        }
    }

    // MARK: Chat

    private var archivoChat: URL {
        Self.carpeta.appendingPathComponent(modoEjemplo ? "chat-ejemplo.json" : "chat.json")
    }

    func agregarAlChat(_ mensaje: MensajeChat) {
        chat.append(mensaje)
        guardarChat()
    }

    func borrarChat() {
        chat = []
        guardarChat()
    }

    private func guardarChat() {
        let recortado = HistorialChat.recortar(chat)
        if let json = try? Backup.codificador().encode(recortado) {
            try? json.write(to: archivoChat, options: [.atomic, .completeFileProtection])
        }
    }

    private static func leerChat(_ url: URL) -> [MensajeChat] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? Backup.decodificador().decode([MensajeChat].self, from: data)) ?? []
    }

    // MARK: Disco

    private func guardar() {
        do {
            let json = try Backup.codificador().encode(datos)
            try json.write(to: archivo, options: [.atomic, .completeFileProtection])
            ultimoError = nil
        } catch {
            ultimoError = "No pude guardar: \(error.localizedDescription)"
        }
        programarAvisos()
    }

    private static func leer(_ url: URL) -> (Datos, String?) {
        guard FileManager.default.fileExists(atPath: url.path) else { return (Datos(), nil) }
        do {
            let data = try Data(contentsOf: url)
            return (try Backup.decodificador().decode(Datos.self, from: data), nil)
        } catch {
            // No se pisa el archivo roto: se guarda una copia para poder recuperarlo.
            let copia = url.deletingPathExtension().appendingPathExtension("roto-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.copyItem(at: url, to: copia)
            return (Datos(), "No pude leer tus datos (guardé una copia en \(copia.lastPathComponent)).")
        }
    }
}

// MARK: - Acciones rápidas

/// Acciones que necesitan un dato antes de guardarse.
enum PedidoDato: Identifiable, Equatable {
    case cosechar(UUID)
    case aFrascos(UUID)
    case semillas(UUID)

    var id: String {
        switch self {
        case .cosechar(let p): "cosechar-\(p)"
        case .aFrascos(let p): "frascos-\(p)"
        case .semillas(let p): "semillas-\(p)"
        }
    }

    var plantaID: UUID {
        switch self {
        case .cosechar(let p), .aFrascos(let p), .semillas(let p): p
        }
    }

    var titulo: String {
        switch self {
        case .cosechar: "Cosechar"
        case .aFrascos: "A frascos"
        case .semillas: "Semillas propias"
        }
    }

    var pregunta: String {
        switch self {
        case .cosechar: "¿Cuántos gramos húmedos?"
        case .aFrascos: "¿Cuántos gramos secos?"
        case .semillas: "¿Cuántas semillas juntaste?"
        }
    }

    var ayuda: String {
        switch self {
        case .cosechar: "Pesá los cogollos recién cortados. Si no tenés balanza, poné 0."
        case .aFrascos: "Pesá los cogollos secos antes de meterlos en los frascos."
        case .semillas: "Se crea un pack de semillas regulares propias."
        }
    }

    var entero: Bool { if case .semillas = self { return true } else { return false } }
}

extension Almacen {
    /// Ejecuta una acción rápida. Devuelve un pedido de dato si hace falta preguntar algo antes.
    @discardableResult
    func ejecutar(_ accion: AccionTarea, plantaID id: UUID, tareaID: String? = nil, dosis: DosisTarea? = nil) -> PedidoDato? {
        let ahora = Date()
        switch accion {
        case .regue:
            cambiar { $0.registrar(.riego, en: id, fecha: ahora, aguaML: dosis?.aguaML) }
        case .fertilice:
            let producto = dosis?.fertilizante?.nombre
            let nota = dosis.flatMap { d in
                d.fertilizante.map { _ in "\(Formato.numero(d.fertilizanteML)) ml en \(Formato.volumen(ml: d.aguaML))" }
            }
            cambiar { $0.registrar(.fertilizante, en: id, fecha: ahora, producto: producto, nota: nota, aguaML: dosis?.aguaML) }
        case .neem:
            cambiar { $0.registrar(.neem, en: id, fecha: ahora, producto: "Jabón potásico con neem") }
        case .hembra:
            cambiar { $0.marcarSexo(.hembra, en: id, fecha: ahora) }
        case .macho:
            cambiar { $0.marcarSexo(.macho, en: id, fecha: ahora) }
        case .moverAdentro:
            cambiar { $0.moverAdentro(id, fecha: ahora) }
        case .juntePolen:
            cambiar { _ = $0.juntarPolen(de: id, fecha: ahora) }
        case .registrarSemillas:
            return .semillas(id)
        case .cosechar:
            return .cosechar(id)
        case .aFrascos:
            return .aFrascos(id)
        case .abriFrascos:
            cambiar { $0.registrar(.curado, en: id, fecha: ahora) }
        case .terminar:
            cambiar { $0.terminar(id, fecha: ahora) }
        case .revise:
            cambiar { $0.registrar(.revision, en: id, fecha: ahora, nota: "Revisé hongos") }
        case .hoyNo:
            if let tareaID { cambiar { $0.posponer(tareaID, hoy: ahora) } }
        }
        return nil
    }

    /// "Regué todas": registra el riego de cada tarea de riego pendiente, con su cantidad de agua.
    func regarTodas(_ tareas: [Tarea]) {
        let ahora = Date()
        let riegos = tareas.filter { $0.tipo == .riego }
        cambiar { d in
            for t in riegos { d.registrar(.riego, en: t.plantaID, fecha: ahora, aguaML: t.dosis?.aguaML) }
        }
    }

    /// "Llovió": cuenta como riego para todas las del patio. Usa los mm de hoy si los hay.
    @discardableResult
    func llovio() -> Int {
        let mm = climaVigente?.dia(hoy)?.lluviaMM
        var cuantas = 0
        cambiar { cuantas = $0.llovio(fecha: Date(), mm: (mm ?? 0) > 0 ? mm : nil) }
        return cuantas
    }

    func ejecutar(_ accion: AccionTarea, en tarea: Tarea) -> PedidoDato? {
        ejecutar(accion, plantaID: tarea.plantaID, tareaID: tarea.id, dosis: tarea.dosis)
    }

    /// Guarda el dato pedido.
    func resolver(_ pedido: PedidoDato, valor: Double) {
        let ahora = Date()
        switch pedido {
        case .cosechar(let id):
            cambiar { $0.cosechar(id, fecha: ahora, gramosHumedos: valor) }
        case .aFrascos(let id):
            cambiar { $0.pasarAFrascos(id, fecha: ahora, gramosSecos: valor) }
        case .semillas(let id):
            cambiar { _ = $0.registrarSemillasPropias(de: id, cantidad: Int(valor), fecha: ahora) }
        }
    }

    /// Dosis de hoy para una planta.
    func dosis(de planta: Planta) -> Dosis {
        CalculoDosis.dosis(de: planta, hoy: hoy, config: datos.config)
    }
}
