import SwiftUI
import ViejoVerdeCore

struct VistaSemillas: View {
    @Environment(Almacen.self) private var almacen
    @State private var nuevoPack = false
    @State private var packEditado: PaqueteSemillas?
    @State private var germinarDesde: PaqueteSemillas?
    @State private var nuevoPolen = false

    private var packs: [PaqueteSemillas] {
        almacen.datos.paquetes.sorted { ($0.cantidad > 0 ? 0 : 1, $0.nombre) < ($1.cantidad > 0 ? 0 : 1, $1.nombre) }
    }
    private var polenes: [Polen] { almacen.datos.polenes.sorted { $0.fecha > $1.fecha } }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if packs.isEmpty {
                        Text("Todavía no cargaste semillas. Tocá + para agregar un pack.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(packs) { pack in
                        FilaPack(pack: pack) { delta in
                            almacen.cambiar { $0.ajustarCantidad(pack.id, en: delta) }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { packEditado = pack }
                        .swipeActions(edge: .leading) {
                            if pack.cantidad > 0 {
                                Button { germinarDesde = pack } label: { Label("Germinar", systemImage: "leaf.fill") }
                                    .tint(Tema.verde)
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                almacen.cambiar { $0.borrarPaquete(pack.id) }
                            } label: { Label("Borrar", systemImage: "trash") }
                        }
                    }
                } header: {
                    Text("Packs")
                } footer: {
                    if !packs.isEmpty {
                        Text("Deslizá a la derecha para germinar una (descuenta 1). Tocá un pack para editarlo.")
                    }
                }

                Section {
                    if polenes.isEmpty {
                        Text("Sin polen guardado.").foregroundStyle(.secondary)
                    }
                    ForEach(polenes) { polen in
                        FilaPolen(polen: polen)
                            .swipeActions(edge: .leading) {
                                Button { almacen.cambiar { $0.alternarPolenUsado(polen.id) } } label: {
                                    Label(polen.usado ? "Sin usar" : "Usado", systemImage: "checkmark")
                                }
                                .tint(Tema.ambar)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    almacen.cambiar { $0.borrarPolen(polen.id) }
                                } label: { Label("Borrar", systemImage: "trash") }
                            }
                    }
                    Button { nuevoPolen = true } label: { Label("Agregar polen a mano", systemImage: "plus") }
                } header: {
                    Text("Polen")
                }

                Section("Cómo guardar") {
                    Label(Guia.consejoSemillas, systemImage: "refrigerator.fill")
                        .font(.subheadline)
                    Label(Guia.consejoPolen, systemImage: "snowflake")
                        .font(.subheadline)
                }
            }
            .navigationTitle("Semillas")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { nuevoPack = true } label: { Image(systemName: "plus.circle.fill").font(.title2) }
                        .accessibilityLabel("Agregar pack")
                }
            }
            .sheet(isPresented: $nuevoPack) { FormPaquete(original: nil) }
            .sheet(item: $packEditado) { FormPaquete(original: $0) }
            .sheet(item: $germinarDesde) { FormPlanta(desdePaquete: $0) }
            .sheet(isPresented: $nuevoPolen) { FormPolen() }
        }
    }
}

private struct FilaPack: View {
    let pack: PaqueteSemillas
    let alCambiar: (Int) -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(pack.nombre).font(.headline)
                    if pack.propias {
                        Text("Propias")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Tema.ambarSuave))
                            .foregroundStyle(Tema.ambar)
                    }
                }
                Text("\(pack.banco) · \(pack.tipo.nombre) · \(pack.semilla.nombre)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button { alCambiar(-1) } label: { Image(systemName: "minus.circle.fill").font(.title2) }
                .buttonStyle(.borderless)
                .disabled(pack.cantidad == 0)
                .accessibilityLabel("Restar una semilla")
            Text("\(pack.cantidad)")
                .font(.title3.weight(.bold).monospacedDigit())
                .frame(minWidth: 30)
                .foregroundStyle(pack.cantidad == 0 ? Color.secondary : Color.primary)
            Button { alCambiar(1) } label: { Image(systemName: "plus.circle.fill").font(.title2) }
                .buttonStyle(.borderless)
                .accessibilityLabel("Sumar una semilla")
        }
        .padding(.vertical, 4)
    }
}

private struct FilaPolen: View {
    let polen: Polen

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(polen.plantaOrigen).font(.headline)
                Spacer()
                if polen.usado {
                    Text("Usado").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
            }
            Text("Juntado el \(Formato.fechaCorta(polen.fecha))")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if !polen.notas.isEmpty {
                Text(polen.notas).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .opacity(polen.usado ? 0.6 : 1)
    }
}

struct FormPaquete: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss
    let original: PaqueteSemillas?

    @State private var nombre = ""
    @State private var banco = ""
    @State private var tipo: TipoPlanta = .auto
    @State private var semilla: TipoSemilla = .feminizada
    @State private var cantidad = 3
    @State private var fecha = Date()
    @State private var propias = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre (ej. Banana Blaze)", text: $nombre)
                    TextField("Banco (ej. Dutch Passion)", text: $banco)
                }
                Section {
                    Picker("Tipo", selection: $tipo) {
                        ForEach(TipoPlanta.allCases, id: \.self) { Text($0.nombre).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Picker("Semilla", selection: $semilla) {
                        ForEach(TipoSemilla.allCases, id: \.self) { Text($0.nombre).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Stepper("Cantidad: \(cantidad)", value: $cantidad, in: 0...999)
                    DatePicker("Comprado", selection: $fecha, in: ...Date(), displayedComponents: .date)
                    Toggle("Semillas propias", isOn: $propias)
                }
            }
            .navigationTitle(original == nil ? "Nuevo pack" : "Editar pack")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { guardar() }
                        .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                guard let o = original else { return }
                nombre = o.nombre
                banco = o.banco
                tipo = o.tipo
                semilla = o.semilla
                cantidad = o.cantidad
                fecha = o.fechaCompra
                propias = o.propias
            }
        }
    }

    private func guardar() {
        var pack = original ?? PaqueteSemillas(nombre: "", banco: "", tipo: tipo, semilla: semilla,
                                               cantidad: 0, fechaCompra: fecha)
        pack.nombre = nombre.trimmingCharacters(in: .whitespaces)
        pack.banco = banco.trimmingCharacters(in: .whitespaces)
        pack.tipo = tipo
        pack.semilla = semilla
        pack.cantidad = cantidad
        pack.fechaCompra = fecha
        pack.propias = propias
        if original == nil {
            almacen.cambiar { $0.agregarPaquete(pack) }
        } else {
            almacen.cambiar { $0.actualizarPaquete(pack) }
        }
        dismiss()
    }
}

private struct FormPolen: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss
    @State private var origen = ""
    @State private var fecha = Date()
    @State private var notas = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("De qué planta (ej. Macho regular 1)", text: $origen)
                DatePicker("Juntado", selection: $fecha, in: ...Date(), displayedComponents: .date)
                TextField("Notas (ej. sobre en frasco con arroz)", text: $notas, axis: .vertical)
            }
            .navigationTitle("Polen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        let polen = Polen(fecha: fecha, plantaOrigen: origen.trimmingCharacters(in: .whitespaces),
                                          notas: notas.trimmingCharacters(in: .whitespacesAndNewlines))
                        almacen.cambiar { $0.agregarPolen(polen) }
                        dismiss()
                    }
                    .disabled(origen.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
