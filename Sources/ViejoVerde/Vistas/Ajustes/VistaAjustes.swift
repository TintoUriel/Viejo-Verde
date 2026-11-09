import SwiftUI
import UniformTypeIdentifiers
import UserNotifications
import ViejoVerdeCore

struct VistaAjustes: View {
    @Environment(Almacen.self) private var almacen

    @State private var claveGuardada = Llavero.leerClave() != nil
    @State private var claveNueva = ""
    @State private var permiso: UNAuthorizationStatus = .notDetermined

    @State private var incluirFotos = true
    @State private var exportando = false
    @State private var documento: DocumentoBackup?
    @State private var importando = false
    @State private var backupPendiente: Backup?
    @State private var confirmarBorrarTodo = false
    @State private var aviso: String?

    var body: some View {
        NavigationStack {
            Form {
                seccionAsistente
                seccionAvisos
                seccionFertilizantes
                seccionBackup
                seccionPeligro
                #if DEBUG
                seccionDebug
                #endif
                Section {
                    LabeledContent("Versión", value: version)
                    Text("Tus datos quedan solo en este iPhone. Lo único que sale es lo que le mandás al asistente.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ajustes")
            .task { permiso = await Notificaciones.estado() }
            .alert("Listo", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(aviso ?? "")
            }
        }
    }

    // MARK: Asistente

    private var seccionAsistente: some View {
        Section {
            if claveGuardada {
                Label("API key guardada", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(Tema.verde)
                Button("Borrar API key", role: .destructive) {
                    Llavero.borrarClave()
                    claveGuardada = false
                }
            } else {
                SecureField("sk-ant-…", text: $claveNueva)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Guardar API key") {
                    let limpia = claveNueva.trimmingCharacters(in: .whitespacesAndNewlines)
                    if Llavero.guardarClave(limpia) {
                        claveNueva = ""
                        claveGuardada = true
                    }
                }
                .disabled(claveNueva.trimmingCharacters(in: .whitespacesAndNewlines).count < 20)
            }
        } header: {
            Text("Asistente (Claude)")
        } footer: {
            Text("Se guarda en el llavero del iPhone, nunca en los backups. La conseguís en console.anthropic.com → API Keys.")
        }
    }

    // MARK: Notificaciones

    private var seccionAvisos: some View {
        Section {
            Toggle("Notificaciones", isOn: Binding(
                get: { almacen.datos.avisos.activos },
                set: { nuevo in
                    almacen.cambiar { $0.avisos.activos = nuevo }
                    if nuevo {
                        Task {
                            _ = await Notificaciones.pedirPermiso()
                            permiso = await Notificaciones.estado()
                            almacen.programarAvisos(inmediato: true)
                        }
                    }
                }
            ))
            if almacen.datos.avisos.activos {
                if permiso == .denied {
                    Button {
                        Notificaciones.abrirAjustesDelSistema()
                    } label: {
                        Label("iOS tiene bloqueadas las notificaciones de Viejo Verde. Tocá para habilitarlas.",
                              systemImage: "bell.slash.fill")
                            .foregroundStyle(Tema.alerta)
                    }
                }
                Toggle("Resumen diario", isOn: enlace(\.avisos.resumenDiario))
                DatePicker("Hora del resumen", selection: horaResumen, displayedComponents: .hourAndMinute)
                    .environment(\.timeZone, Calendario.zona)
                Toggle("Avisos puntuales", isOn: enlace(\.avisos.puntuales))
                Button("Probar una notificación") {
                    Task {
                        await Notificaciones.probar()
                        permiso = await Notificaciones.estado()
                    }
                }
            }
        } header: {
            Text("Notificaciones")
        } footer: {
            Text("Puntuales: sexado (día 21 de las regulares), pasar a Top Bloom, revisar tricomas, probar tallitos y abrir frascos.")
        }
    }

    private var horaResumen: Binding<Date> {
        Binding(
            get: {
                Calendario.cal.date(bySettingHour: almacen.datos.avisos.hora,
                                    minute: almacen.datos.avisos.minuto, second: 0, of: Date()) ?? Date()
            },
            set: { fecha in
                let c = Calendario.cal.dateComponents([.hour, .minute], from: fecha)
                almacen.cambiar {
                    $0.avisos.hora = c.hour ?? 9
                    $0.avisos.minuto = c.minute ?? 0
                }
            }
        )
    }

    // MARK: Fertilizantes

    private var seccionFertilizantes: some View {
        let cfg = almacen.datos.config
        return Section {
            Stepper(value: enlace(\.config.topVegEtiquetaMlPorLitro), in: 0.5...20, step: 0.5) {
                VStack(alignment: .leading) {
                    Text("Top Veg: \(Formato.numero(cfg.topVegEtiquetaMlPorLitro)) ml/L en la etiqueta")
                    Text("La app usa \(Formato.numero(cfg.topVegEtiquetaMlPorLitro / 2)) ml/L")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Stepper(value: enlace(\.config.topBloomEtiquetaMlPorLitro), in: 0.5...20, step: 0.5) {
                VStack(alignment: .leading) {
                    Text("Top Bloom: \(Formato.numero(cfg.topBloomEtiquetaMlPorLitro)) ml/L en la etiqueta")
                    Text("La app usa \(Formato.numero(cfg.topBloomEtiquetaMlPorLitro / 2)) ml/L")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Fertilizantes")
        } footer: {
            Text("Copiá la dosis que dice cada botella. La app siempre calcula la mitad.")
        }
    }

    // MARK: Backup

    private var seccionBackup: some View {
        Section {
            Toggle("Incluir fotos", isOn: $incluirFotos)
            Button {
                documento = DocumentoBackup(data: armarBackup())
                exportando = documento != nil
            } label: {
                Label("Exportar backup", systemImage: "square.and.arrow.up")
            }
            .fileExporter(isPresented: $exportando, document: documento, contentType: .json,
                          defaultFilename: "viejo-verde-\(Calendario.claveDia(Date()))") { resultado in
                if case .success = resultado { aviso = "Backup guardado." }
            }

            Button {
                importando = true
            } label: {
                Label("Importar backup", systemImage: "square.and.arrow.down")
            }
            .fileImporter(isPresented: $importando, allowedContentTypes: [.json]) { resultado in
                leerBackup(resultado)
            }
        } header: {
            Text("Backup")
        } footer: {
            Text("Es un archivo JSON. Guardalo en Archivos, iCloud Drive o mandátelo por mensaje.")
        }
        .confirmationDialog("¿Reemplazar tus datos con este backup?",
                            isPresented: Binding(get: { backupPendiente != nil }, set: { if !$0 { backupPendiente = nil } }),
                            titleVisibility: .visible) {
            Button("Reemplazar todo", role: .destructive) { aplicarBackup() }
            Button("Cancelar", role: .cancel) { backupPendiente = nil }
        } message: {
            if let b = backupPendiente {
                Text("El backup del \(Formato.fechaCorta(b.exportado)) tiene \(b.datos.plantas.count) plantas y \(b.datos.paquetes.count) packs. Lo que tenés ahora se pierde.")
            }
        }
    }

    private func armarBackup() -> Data? {
        var fotos: [String: Data] = [:]
        if incluirFotos {
            for nombre in almacen.datos.todasLasFotos {
                if let d = Fotos.datos(nombre) { fotos[nombre] = d }
            }
        }
        return try? Backup(datos: almacen.datos, exportado: Date(), fotos: fotos).json()
    }

    private func leerBackup(_ resultado: Result<URL, Error>) {
        switch resultado {
        case .success(let url):
            let acceso = url.startAccessingSecurityScopedResource()
            defer { if acceso { url.stopAccessingSecurityScopedResource() } }
            do {
                backupPendiente = try Backup.leer(Data(contentsOf: url))
            } catch {
                aviso = "No pude leer ese archivo: no parece un backup de Viejo Verde."
            }
        case .failure(let error):
            aviso = "No pude abrir el archivo: \(error.localizedDescription)"
        }
    }

    private func aplicarBackup() {
        guard let b = backupPendiente else { return }
        for (nombre, data) in b.fotos { Fotos.escribir(data, nombre: nombre) }
        almacen.reemplazarTodo(con: b.datos)
        backupPendiente = nil
        aviso = "Backup importado: \(b.datos.plantas.count) plantas."
    }

    // MARK: Borrar todo

    private var seccionPeligro: some View {
        Section {
            Button("Borrar todos los datos", role: .destructive) { confirmarBorrarTodo = true }
                .confirmationDialog("¿Borrar todo?", isPresented: $confirmarBorrarTodo, titleVisibility: .visible) {
                    Button("Borrar plantas, semillas, polen y fotos", role: .destructive) {
                        almacen.borrarTodo()
                    }
                } message: {
                    Text("No se puede deshacer. Si querés, primero exportá un backup.")
                }
        } footer: {
            Text("La API key no se borra con esto.")
        }
    }

    // MARK: Debug

    #if DEBUG
    private var seccionDebug: some View {
        Section {
            if almacen.modoEjemplo {
                Button("Salir del ejemplo") { almacen.salirModoEjemplo() }
            } else {
                Button("Cargar ejemplo") { almacen.entrarModoEjemplo() }
            }
        } header: {
            Text("Debug")
        } footer: {
            Text("El ejemplo usa un archivo aparte: tus datos reales no se tocan.")
        }
    }
    #endif

    // MARK: Ayudas

    private func enlace<T>(_ ruta: WritableKeyPath<Datos, T>) -> Binding<T> {
        Binding(get: { almacen.datos[keyPath: ruta] },
                set: { valor in almacen.cambiar { $0[keyPath: ruta] = valor } })
    }

    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }
}

/// El backup como documento para el selector de archivos.
struct DocumentoBackup: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    let data: Data

    init?(data: Data?) {
        guard let data else { return nil }
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        guard let d = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        data = d
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
