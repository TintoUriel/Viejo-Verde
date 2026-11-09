import SwiftUI
import UIKit
import ViejoVerdeCore

struct VistaAsistente: View {
    @Environment(Almacen.self) private var almacen
    @State private var mensajes: [MensajeChat] = []
    @State private var texto = ""
    @State private var foto: UIImage?
    @State private var enviando = false
    @State private var eligiendoFoto = false
    @State private var mostrarGuia = false
    @FocusState private var enfocado: Bool

    private let idFinal = "final"

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        if mensajes.isEmpty { bienvenida }
                        ForEach(mensajes) { m in
                            Burbuja(mensaje: m).id(m.id)
                        }
                        if enviando {
                            HStack(spacing: 8) {
                                ProgressView()
                                Text("Pensando…").foregroundStyle(.secondary)
                            }
                            .padding(.leading, 4)
                        }
                        Color.clear.frame(height: 1).id(idFinal)
                    }
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: mensajes.count) { _, _ in
                    withAnimation { proxy.scrollTo(idFinal, anchor: .bottom) }
                }
                .onChange(of: enviando) { _, _ in
                    withAnimation { proxy.scrollTo(idFinal, anchor: .bottom) }
                }
            }
            .background(Tema.fondo)
            .safeAreaInset(edge: .bottom) { barraEntrada }
            .navigationTitle("Asistente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { mostrarGuia = true } label: { Label("Guía", systemImage: "book.fill") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        mensajes = []
                        texto = ""
                        foto = nil
                    } label: { Label("Nuevo chat", systemImage: "square.and.pencil") }
                    .disabled(mensajes.isEmpty || enviando)
                }
            }
            .sheet(isPresented: $mostrarGuia) {
                NavigationStack {
                    ScrollView { GuiaRapida(desplegada: true).padding() }
                        .background(Tema.fondo)
                        .navigationTitle("Guía rápida")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Listo") { mostrarGuia = false }
                            }
                        }
                }
            }
            .selectorDeFoto(presentado: $eligiendoFoto) { foto = $0 }
        }
    }

    // MARK: Pantalla inicial

    private var bienvenida: some View {
        VStack(alignment: .leading, spacing: 14) {
            Tarjeta(fondo: Tema.verdeSuave) {
                Label("Preguntame lo que quieras", systemImage: "leaf.fill")
                    .font(.headline)
                    .foregroundStyle(Tema.verde)
                Text("Ya conozco tus plantas, en qué etapa están y cuándo las regaste. Si algo se ve raro, mandame una foto.")
                    .font(.subheadline)
                if Llavero.leerClave() == nil {
                    Label("Primero cargá tu API key de Anthropic en Ajustes.", systemImage: "key.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Tema.ambar)
                }
            }
            Text("Sin internet").font(.title3.weight(.bold)).padding(.top, 6)
            GuiaRapida(desplegada: false)
        }
    }

    // MARK: Barra de entrada

    private var barraEntrada: some View {
        VStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ContextoAsistente.chips, id: \.self) { chip in
                        Button { enviar(chip) } label: {
                            Text(chip)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(Tema.verdeSuave))
                                .foregroundStyle(Tema.verde)
                        }
                        .buttonStyle(.plain)
                        .disabled(enviando)
                    }
                }
                .padding(.horizontal)
            }

            if let foto {
                HStack {
                    Image(uiImage: foto)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    Text("Foto lista para mandar").font(.footnote).foregroundStyle(.secondary)
                    Spacer()
                    Button { self.foto = nil } label: { Image(systemName: "xmark.circle.fill").font(.title3) }
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)
            }

            HStack(alignment: .bottom, spacing: 8) {
                Button { eligiendoFoto = true } label: {
                    Image(systemName: "camera.fill").font(.title2).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Adjuntar foto")
                TextField("Escribí tu pregunta…", text: $texto, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($enfocado)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Tema.tarjeta))
                Button { enviar(texto) } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 36))
                }
                .disabled(!puedeEnviar)
                .accessibilityLabel("Enviar")
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var puedeEnviar: Bool {
        !enviando && (!texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || foto != nil)
    }

    // MARK: Enviar

    private func enviar(_ pregunta: String) {
        let limpia = pregunta.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !enviando, !limpia.isEmpty || foto != nil else { return }
        guard let clave = Llavero.leerClave() else {
            mensajes.append(MensajeChat(rol: .usuario, texto: limpia))
            mensajes.append(MensajeChat(rol: .asistente, texto: ErrorClaude.sinClave.mensaje, esError: true))
            return
        }
        let jpeg = foto.flatMap { Fotos.jpegParaClaude($0) }
        mensajes.append(MensajeChat(rol: .usuario, texto: limpia, imagenJPEG: jpeg))
        texto = ""
        foto = nil
        enfocado = false
        enviando = true

        let historial = mensajes
        let contexto = ContextoAsistente.contexto(datos: almacen.datos, hoy: Date())
        Task {
            let resultado = await ClienteClaude.enviar(historial: historial, contexto: contexto, apiKey: clave)
            switch resultado {
            case .success(let r):
                mensajes.append(MensajeChat(rol: .asistente, texto: r.texto, bloques: r.bloques))
            case .failure(let error):
                mensajes.append(MensajeChat(rol: .asistente, texto: error.mensaje, esError: true))
            }
            enviando = false
        }
    }
}

// MARK: - Burbuja de chat

private struct Burbuja: View {
    let mensaje: MensajeChat

    private var esUsuario: Bool { mensaje.rol == .usuario }

    var body: some View {
        HStack {
            if esUsuario { Spacer(minLength: 40) }
            VStack(alignment: esUsuario ? .trailing : .leading, spacing: 6) {
                if let data = mensaje.imagenJPEG, let imagen = UIImage(data: data) {
                    Image(uiImage: imagen)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 220, maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                if !mensaje.texto.isEmpty {
                    Text(textoConFormato)
                        .font(.body)
                        .textSelection(.enabled)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(fondo))
                        .foregroundStyle(mensaje.esError ? Tema.alerta : Color.primary)
                }
            }
            if !esUsuario { Spacer(minLength: 40) }
        }
    }

    private var fondo: Color {
        if mensaje.esError { return Tema.alerta.opacity(0.12) }
        return esUsuario ? Tema.verdeSuave : Tema.tarjeta
    }

    /// Negritas, cursivas y saltos de línea del markdown de Claude.
    private var textoConFormato: AttributedString {
        let opciones = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: mensaje.texto, options: opciones)) ?? AttributedString(mensaje.texto)
    }
}

// MARK: - Guía rápida offline

struct GuiaRapida: View {
    var desplegada: Bool

    var body: some View {
        VStack(spacing: 10) {
            ForEach(Guia.secciones) { s in
                SeccionDesplegable(seccion: s, abierta: desplegada)
            }
        }
    }
}

private struct SeccionDesplegable: View {
    let seccion: SeccionGuia
    @State private var abierta: Bool

    init(seccion: SeccionGuia, abierta: Bool) {
        self.seccion = seccion
        _abierta = State(initialValue: abierta)
    }

    var body: some View {
        Tarjeta {
            DisclosureGroup(isExpanded: $abierta) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(seccion.pasos.enumerated()), id: \.offset) { i, paso in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(i + 1).")
                                .font(.subheadline.weight(.bold).monospacedDigit())
                                .foregroundStyle(Tema.verde)
                            Text(paso).font(.subheadline)
                        }
                    }
                }
                .padding(.top, 8)
            } label: {
                Label(seccion.titulo, systemImage: seccion.icono)
                    .font(.headline)
                    .foregroundStyle(Color.primary)
            }
            .tint(Tema.verde)
        }
    }
}
