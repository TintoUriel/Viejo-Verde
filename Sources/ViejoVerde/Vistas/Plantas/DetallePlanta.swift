import SwiftUI
import ViejoVerdeCore

struct DetallePlanta: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss
    let plantaID: UUID

    @State private var pedido: PedidoDato?
    @State private var editando = false
    @State private var nota = false
    @State private var eligiendoFoto = false
    @State private var fotoAbierta: FotoElegida?
    @State private var registroEditado: Registro?
    @State private var confirmarPolinizacion = false
    @State private var confirmarDescarte = false
    @State private var confirmarBorrado = false
    @State private var hechas = 0

    var body: some View {
        Group {
            if let p = almacen.datos.planta(plantaID) {
                contenido(p)
            } else {
                ContentUnavailableView("La planta ya no existe", systemImage: "leaf")
            }
        }
        .background(Tema.fondo)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $pedido) { SheetNumero(pedido: $0) }
        .sheet(isPresented: $nota) { NuevaNota(plantaID: plantaID) }
        .sheet(item: $registroEditado) { EditarRegistro(plantaID: plantaID, registro: $0) }
        .sheet(item: $fotoAbierta) { f in
            VisorFoto(nombre: f.nombre) {
                Fotos.borrar(f.nombre)
                almacen.cambiar { $0.quitarFoto(f.nombre, en: plantaID) }
            }
        }
        .sheet(isPresented: $editando) {
            if let p = almacen.datos.planta(plantaID) { FormPlanta(editando: p) }
        }
        .selectorDeFoto(presentado: $eligiendoFoto) { imagen in
            if let nombre = Fotos.guardar(imagen) {
                almacen.cambiar { $0.agregarFoto(nombre, en: plantaID) }
            }
        }
        .sensoryFeedback(.success, trigger: hechas)
    }

    // MARK: - Contenido

    private func contenido(_ p: Planta) -> some View {
        let e = almacen.estado(de: p)
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                cabecera(p, e)
                if p.estado == .activa {
                    dosisDeHoy(p, e)
                    accionesRapidas(p, e)
                }
                consejos(e)
                if p.estado == .activa && p.semilla == .regular { sexo(p) }
                polen(p, e)
                flujoCosecha(p)
                fotos(p)
                historial(p)
                zonaPeligrosa(p)
            }
            .padding()
        }
        .navigationTitle(p.nombre)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Editar") { editando = true }
            }
        }
        .confirmationDialog("¿Polinizaste una rama de \(p.nombre)?", isPresented: $confirmarPolinizacion,
                            titleVisibility: .visible) {
            Button("Sí, polinicé una rama") { hacer { $0.polinizar(plantaID, fecha: Date()) } }
        } message: {
            Text("En 35 días te aviso para revisar las semillas.")
        }
        .confirmationDialog("¿Descartar \(p.nombre)?", isPresented: $confirmarDescarte, titleVisibility: .visible) {
            Button("Descartar", role: .destructive) { hacer { $0.descartar(plantaID, fecha: Date()) } }
        } message: {
            Text("Queda en el historial, pero deja de generar tareas.")
        }
        .confirmationDialog("¿Borrar \(p.nombre) para siempre?", isPresented: $confirmarBorrado,
                            titleVisibility: .visible) {
            Button("Borrar planta", role: .destructive) {
                almacen.borrarPlanta(plantaID)
                dismiss()
            }
        } message: {
            Text("Se borran también su historial y sus fotos. No se puede deshacer.")
        }
    }

    private func hacer(_ cambio: (inout Datos) -> Void) {
        almacen.cambiar(cambio)
        hechas += 1
    }

    private func accion(_ a: AccionTarea, dosis: Dosis? = nil) {
        if let pedidoNuevo = almacen.ejecutar(a, plantaID: plantaID, dosis: dosis.map { DosisTarea($0) }) {
            pedido = pedidoNuevo
        } else {
            hechas += 1
        }
    }

    // MARK: Cabecera

    private func cabecera(_ p: Planta, _ e: EstadoEtapa) -> some View {
        Tarjeta {
            HStack(alignment: .firstTextBaseline) {
                Text(e.etapa.nombre)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(Tema.color(e.etapa))
                Spacer()
                if p.estado == .activa {
                    Text("Día \(e.dia) · Sem \(e.semana)")
                        .font(.headline.monospacedDigit())
                }
            }
            Text(descripcion(p))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            BarraEtapas(estado: e)
            if p.estado == .activa && p.sexo != .macho {
                Label("Cosecha estimada desde el \(Formato.fechaCorta(Planificador.cosechaEstimada(de: p)))",
                      systemImage: "calendar")
                    .font(.footnote)
                    .foregroundStyle(Tema.ambar)
            }
            switch p.estado {
            case .secando:
                Text("Secando hace \(e.diaEnEtapa) días").font(.subheadline.weight(.semibold))
            case .curando:
                Text("En frascos hace \(e.diaEnEtapa) días").font(.subheadline.weight(.semibold))
            default:
                EmptyView()
            }
        }
    }

    private func descripcion(_ p: Planta) -> String {
        var partes: [String?] = [p.variedad.isEmpty ? nil : p.variedad, p.tipo.nombre, p.semilla.nombre]
        if p.semilla == .regular { partes.append(p.sexo.nombre) }
        partes.append(p.ubicacion.nombre)
        partes.append("\(Formato.numero(p.litrosMaceta)) L")
        partes.append("germinó el \(Formato.fechaCorta(p.fechaGerminacion))")
        return partes.compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: Dosis de hoy

    private func dosisDeHoy(_ p: Planta, _ e: EstadoEtapa) -> some View {
        let d = almacen.dosis(de: p)
        return Tarjeta {
            Label("Si toca regar hoy", systemImage: "drop.fill")
                .font(.headline)
                .foregroundStyle(.blue)
            HStack(spacing: 8) {
                Pastilla(icono: "drop.fill", texto: d.textoAgua, color: .blue)
                if let f = d.fertilizante {
                    Pastilla(icono: "flask.fill", texto: "\(Formato.numero(d.fertilizanteML)) ml \(f.nombre)", color: Tema.verde)
                } else {
                    Pastilla(icono: "drop", texto: "Solo agua", color: .secondary)
                }
            }
            if let f = d.fertilizante {
                Text("\(Formato.numero(d.mlPorLitro)) ml de \(f.nombre) por litro (mitad de la etiqueta), cada \(Tareas.diasEntreFertilizantes)+ días.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Text("Antes, levantá la maceta: si pesa, no hace falta.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: Acciones rápidas

    private func accionesRapidas(_ p: Planta, _ e: EstadoEtapa) -> some View {
        let d = almacen.dosis(de: p)
        let neemPermitido = e.etapa == .plantula || e.etapa == .crecimiento || e.etapa == .prefloracion
        let columnas = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return VStack(alignment: .leading, spacing: 8) {
            Text("Registrar").font(.title3.weight(.bold))
            LazyVGrid(columns: columnas, spacing: 8) {
                BotonGrande(titulo: "Regué", icono: "drop.fill", color: .blue) { accion(.regue, dosis: d) }
                BotonGrande(titulo: d.fertilizante == nil ? "Fertilicé" : "Fertilicé (\(d.fertilizante!.nombre))",
                            icono: "flask.fill") { accion(.fertilice, dosis: d) }
                    .disabled(d.fertilizante == nil)
                    .opacity(d.fertilizante == nil ? 0.4 : 1)
                BotonGrande(titulo: "Neem", icono: "sparkles", color: .teal) { accion(.neem) }
                    .disabled(!neemPermitido)
                    .opacity(neemPermitido ? 1 : 0.4)
                BotonGrande(titulo: "Nota o problema", icono: "square.and.pencil", color: Tema.ambar, relleno: false) {
                    nota = true
                }
                BotonGrande(titulo: "Foto", icono: "camera.fill", color: Tema.ambar, relleno: false) {
                    eligiendoFoto = true
                }
            }
            if !neemPermitido {
                Text("Nada de neem desde la floración: no se rocían los cogollos.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if d.fertilizante == nil {
                Text("Hoy toca solo agua, sin fertilizante.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Consejos

    private func consejos(_ e: EstadoEtapa) -> some View {
        Tarjeta(fondo: Tema.verdeSuave) {
            Label("Consejos de \(e.etapa.nombre.lowercased())", systemImage: "lightbulb.fill")
                .font(.headline)
                .foregroundStyle(Tema.verde)
            ForEach(e.etapa.consejos, id: \.self) { c in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•").foregroundStyle(Tema.verde)
                    Text(c).font(.subheadline)
                }
            }
        }
    }

    // MARK: Sexo

    private func sexo(_ p: Planta) -> some View {
        Tarjeta {
            Label("Sexo", systemImage: "questionmark.circle")
                .font(.headline)
            Picker("Sexo", selection: Binding(
                get: { p.sexo },
                set: { nuevo in if nuevo != p.sexo { hacer { $0.marcarSexo(nuevo, en: plantaID, fecha: Date()) } } }
            )) {
                ForEach(Sexo.allCases, id: \.self) { Text($0.nombre).tag($0) }
            }
            .pickerStyle(.segmented)
            if p.sexo == .macho && p.ubicacion == .patio {
                Label("Es macho y está en el patio: alejalo de las hembras.", systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Tema.alerta)
                BotonGrande(titulo: "Lo llevé adentro", icono: "house.fill", color: Tema.alerta) { accion(.moverAdentro) }
            } else if p.sexo == .desconocido {
                Text("Desde el día 21: pelitos blancos = hembra; bolitas colgando = macho.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Polen y semillas

    @ViewBuilder
    private func polen(_ p: Planta, _ e: EstadoEtapa) -> some View {
        let hembraEnFlor = p.estado == .activa && p.sexo == .hembra &&
            [Etapa.prefloracion, .floracion, .maduracion, .listaCosecha].contains(e.etapa)
        let machoAdentro = p.estado == .activa && p.sexo == .macho && p.ubicacion == .interior
        if hembraEnFlor || machoAdentro || p.fechaPolinizacion != nil {
            Tarjeta {
                Label("Polen y semillas", systemImage: "aqi.medium").font(.headline)
                if machoAdentro {
                    Text(p.polenJuntado ? "Ya juntaste polen de este macho." :
                            "Cuando las bolitas empiecen a abrirse, cortá 2–3 ramas y juntá el polen.")
                        .font(.subheadline)
                    BotonGrande(titulo: "Junté polen", icono: "aqi.medium", relleno: !p.polenJuntado) { accion(.juntePolen) }
                }
                if let fp = p.fechaPolinizacion {
                    let dias = Calendario.dias(desde: fp, hasta: almacen.hoy)
                    Text("Polinizada el \(Formato.fechaCorta(fp)) (hace \(dias) días). Semillas listas a partir del día \(Tareas.diasSemillas), cuando están marrones o atigradas.")
                        .font(.subheadline)
                    BotonGrande(titulo: "Registrar semillas propias", icono: "circle.grid.3x3.fill",
                                relleno: dias >= Tareas.diasSemillas) {
                        pedido = .semillas(plantaID)
                    }
                }
                if hembraEnFlor {
                    BotonGrande(titulo: "Polinicé una rama", icono: "paintbrush.pointed.fill", color: Tema.ambar,
                                relleno: false) {
                        confirmarPolinizacion = true
                    }
                }
            }
        }
    }

    // MARK: Cosecha → secado → curado → terminada

    @ViewBuilder
    private func flujoCosecha(_ p: Planta) -> some View {
        switch p.estado {
        case .activa where p.sexo != .macho:
            Tarjeta {
                Label("Cosecha", systemImage: "scissors").font(.headline)
                Text("Cuando los tricomas estén mayoría lechosos con algunos ámbar.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                BotonGrande(titulo: "Cosechar", icono: "scissors", color: Tema.ambar) { pedido = .cosechar(plantaID) }
            }
        case .secando:
            Tarjeta {
                datosCosecha(p)
                BotonGrande(titulo: "Pasar a frascos", icono: "takeoutbag.and.cup.and.straw.fill", color: Tema.ambar) {
                    pedido = .aFrascos(plantaID)
                }
            }
        case .curando:
            Tarjeta {
                datosCosecha(p)
                HStack(spacing: 8) {
                    BotonGrande(titulo: "Abrí los frascos", icono: "lock.open.fill", color: Tema.ambar) { accion(.abriFrascos) }
                    BotonGrande(titulo: "Terminar", icono: "checkmark.seal.fill", relleno: false) { accion(.terminar) }
                }
            }
        case .terminada:
            Tarjeta { datosCosecha(p) }
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func datosCosecha(_ p: Planta) -> some View {
        Label("Cosecha", systemImage: "scissors").font(.headline)
        if let c = p.cosecha {
            Text("Cosechada el \(Formato.fechaCorta(c.fecha)): \(Formato.numero(c.gramosHumedos)) g húmedos.")
                .font(.subheadline)
            if let f = c.fechaFrascos {
                Text("A frascos el \(Formato.fechaCorta(f))" + (c.gramosSecos.map { ": \(Formato.numero($0)) g secos." } ?? "."))
                    .font(.subheadline)
            }
            if let secos = c.gramosSecos, c.gramosHumedos > 0 {
                Text("Quedó el \(Formato.numero(secos / c.gramosHumedos * 100)) % del peso húmedo.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Fotos

    private func fotos(_ p: Planta) -> some View {
        Tarjeta {
            HStack {
                Label("Fotos", systemImage: "photo.on.rectangle").font(.headline)
                Spacer()
                Button { eligiendoFoto = true } label: { Image(systemName: "plus.circle.fill").font(.title3) }
                    .accessibilityLabel("Agregar foto")
            }
            if p.fotos.isEmpty {
                Text("Sacale fotos seguido: sirve para comparar y para el asistente.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(p.lineaDeTiempo.reversed()) { f in
                            Button { fotoAbierta = FotoElegida(nombre: f.nombre) } label: { Miniatura(nombre: f.nombre) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                if p.fotos.count >= 2 {
                    NavigationLink {
                        VistaLineaTiempo(plantaID: plantaID)
                    } label: {
                        Label("Ver línea de tiempo", systemImage: "photo.stack")
                            .font(.subheadline.weight(.semibold))
                    }
                }
            }
        }
    }

    // MARK: Historial editable

    private func historial(_ p: Planta) -> some View {
        Tarjeta {
            Label("Historial", systemImage: "clock.arrow.circlepath").font(.headline)
            if p.registros.isEmpty {
                Text("Sin registros todavía.").font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(p.historial) { r in
                Button { registroEditado = r } label: { FilaRegistro(registro: r) }
                    .buttonStyle(.plain)
                if r.id != p.historial.last?.id { Divider() }
            }
            Text("Tocá un registro para editarlo o borrarlo.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    // MARK: Descartar / borrar

    private func zonaPeligrosa(_ p: Planta) -> some View {
        VStack(spacing: 8) {
            if p.estado == .activa {
                BotonGrande(titulo: "Descartar planta", icono: "xmark.bin", color: .secondary, relleno: false) {
                    confirmarDescarte = true
                }
            }
            BotonGrande(titulo: "Borrar planta", icono: "trash", color: Tema.alerta, relleno: false) {
                confirmarBorrado = true
            }
        }
        .padding(.top, 8)
    }
}

struct FilaRegistro: View {
    let registro: Registro

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: registro.tipo.icono)
                .foregroundStyle(registro.tipo.color)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(registro.tipo.nombre).font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(Formato.fechaCorta(registro.fecha))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                if let detalle = detalle, !detalle.isEmpty {
                    Text(detalle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
            }
        }
        .contentShape(Rectangle())
    }

    private var detalle: String? {
        var partes: [String] = []
        if let p = registro.producto, !p.isEmpty { partes.append(p) }
        if let a = registro.aguaML { partes.append(Formato.volumen(ml: a) + " de agua") }
        if let n = registro.nota, !n.isEmpty { partes.append(n) }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}
