import Foundation

/// Convierte lo que pasa en la app en eventos para la hoja "Registro" y en filas para la hoja "Plantas".
///
/// Los IDs son estables cuando se puede (un registro usa su propio UUID; un cambio de etapa,
/// "etapa-<planta>-<etapa>"), así "Sincronizar todo" genera exactamente los mismos IDs que el envío
/// normal y la planilla los ignora si ya los tiene.
public enum Eventos {

    // MARK: Cambios (antes → después)

    /// Eventos que salen de un cambio en los datos. No incluye los cambios de etapa (ver `cambiosDeEtapa`).
    public static func detectar(antes a: Datos, despues d: Datos, ahora: Date, app: String,
                                nuevoID: () -> String = { UUID().uuidString }) -> [EventoSync] {
        var r: [EventoSync] = []

        // --- Plantas ---
        for p in d.plantas {
            guard let viejo = a.planta(p.id) else {
                // Planta nueva: su historial (germinación y lo que traiga) y sus fotos.
                r += p.registros.sorted { $0.fecha < $1.fecha }.compactMap { evento(de: $0, en: p, app: app) }
                r += p.fotos.map { eventoFoto($0, en: p, app: app) }
                continue
            }
            guard viejo != p else { continue }

            let anteriores = Dictionary(viejo.registros.map { ($0.id, $0) }, uniquingKeysWith: { x, _ in x })
            let actuales = Set(p.registros.map(\.id))
            let nuevos = p.registros.filter { anteriores[$0.id] == nil }

            r += nuevos.sorted { $0.fecha < $1.fecha }.compactMap { evento(de: $0, en: p, app: app) }

            for reg in p.registros {
                if let ant = anteriores[reg.id], ant != reg {
                    r.append(base(nuevoID(), ahora, .correccion, p, app: app,
                                  nota: "Corrige \(reg.id.uuidString): \(resumen(ant)) → \(resumen(reg))"))
                }
            }
            for ant in viejo.registros where !actuales.contains(ant.id) {
                r.append(base(nuevoID(), ahora, .borrado, p, app: app,
                              nota: "Borra \(ant.id.uuidString): \(resumen(ant))"))
            }

            // Fotos (solo el hecho, nunca la imagen).
            let fotosViejas = Set(viejo.fotos)
            let fotosNuevas = Set(p.fotos)
            r += p.fotos.filter { !fotosViejas.contains($0) }.map { eventoFoto($0, en: p, app: app) }
            for f in viejo.fotos where !fotosNuevas.contains(f) {
                r.append(base(nuevoID(), ahora, .borrado, p, app: app, nota: "Borra \(idFoto(f)): foto"))
            }

            // Ubicación cambiada a mano (si fue con "Lo llevé adentro", ya va como registro).
            if viejo.ubicacion != p.ubicacion, !nuevos.contains(where: { $0.subtipoEfectivo == .ubicacion }) {
                r.append(base(nuevoID(), ahora, .cambioUbicacion, p, app: app,
                              nota: "\(viejo.ubicacion.nombre) → \(p.ubicacion.nombre)"))
            }

            // Datos de la planta corregidos en "Editar planta".
            let cambios = cambiosDeDatos(viejo, p, conSexo: !nuevos.contains { $0.tipo == .sexo })
            if !cambios.isEmpty {
                r.append(base(nuevoID(), ahora, .correccion, p, app: app,
                              nota: "Datos de la planta: " + cambios.joined(separator: "; ")))
            }
        }
        for viejo in a.plantas where d.planta(viejo.id) == nil {
            r.append(base(nuevoID(), ahora, .borrado, viejo, app: app,
                          nota: "Borré la planta \(viejo.nombre) (tenía \(viejo.registros.count) registros)"))
        }

        // --- Semillas ---
        for pack in d.paquetes {
            guard let viejo = a.paquetes.first(where: { $0.id == pack.id }) else {
                r.append(altaPaquete(pack, datos: d, app: app))
                continue
            }
            let delta = pack.cantidad - viejo.cantidad
            if delta != 0 {
                var nota = "\(pack.nombre): \(viejo.cantidad) → \(pack.cantidad)"
                let germinadas = d.plantas.filter { $0.paqueteOrigenID == pack.id && a.planta($0.id) == nil }
                if delta < 0, !germinadas.isEmpty {
                    nota += ". Germiné: " + germinadas.map(\.nombre).joined(separator: ", ")
                }
                r.append(eventoPaquete(nuevoID(), ahora, delta > 0 ? .altaSemillas : .bajaSemillas, pack, datos: d,
                                       cantidad: Double(abs(delta)), nota: nota, app: app))
            }
            var cambios: [String] = []
            if viejo.nombre != pack.nombre { cambios.append("nombre: \(viejo.nombre) → \(pack.nombre)") }
            if viejo.banco != pack.banco { cambios.append("banco: \(viejo.banco) → \(pack.banco)") }
            if viejo.tipo != pack.tipo { cambios.append("tipo: \(viejo.tipo.nombre) → \(pack.tipo.nombre)") }
            if viejo.semilla != pack.semilla { cambios.append("semilla: \(viejo.semilla.nombre) → \(pack.semilla.nombre)") }
            if !cambios.isEmpty {
                r.append(eventoPaquete(nuevoID(), ahora, .correccion, pack, datos: d, cantidad: nil,
                                       nota: "Corrige \(idPaquete(pack.id)): " + cambios.joined(separator: "; "), app: app))
            }
        }
        for viejo in a.paquetes where !d.paquetes.contains(where: { $0.id == viejo.id }) {
            r.append(eventoPaquete(nuevoID(), ahora, .bajaSemillas, viejo, datos: a, cantidad: Double(viejo.cantidad),
                                   nota: "Borré el pack \(viejo.nombre)", app: app))
        }

        // --- Polen ---
        for polen in d.polenes {
            guard let viejo = a.polenes.first(where: { $0.id == polen.id }) else {
                r.append(eventoPolen(idPolen(polen.id), polen.fecha, .polenJuntado, polen, datos: d,
                                     nota: polen.notas.isEmpty ? nil : polen.notas, app: app))
                continue
            }
            if !viejo.usado && polen.usado {
                r.append(eventoPolen(nuevoID(), ahora, .polenUsado, polen, datos: d, nota: nil, app: app))
            } else if viejo.usado && !polen.usado {
                r.append(eventoPolen(nuevoID(), ahora, .correccion, polen, datos: d,
                                     nota: "Corrige \(idPolen(polen.id)): marcado como no usado", app: app))
            }
        }
        for viejo in a.polenes where !d.polenes.contains(where: { $0.id == viejo.id }) {
            r.append(eventoPolen(nuevoID(), ahora, .borrado, viejo, datos: a,
                                 nota: "Borra \(idPolen(viejo.id)): polen de \(viejo.plantaOrigen)", app: app))
        }

        // --- Tareas salteadas ("Hoy no") ---
        for (tareaID, dia) in d.pospuestas.sorted(by: { $0.key < $1.key }) where a.pospuestas[tareaID] != dia {
            r.append(tareaSalteada(tareaID, datos: d, ahora: ahora, id: nuevoID(), app: app))
        }

        return r
    }

    // MARK: Registro → evento

    /// El evento de un registro del historial (nil si lo cubre otro evento, como el polen o las semillas propias).
    public static func evento(de reg: Registro, en p: Planta, app: String) -> EventoSync? {
        var e = base(reg.id.uuidString, reg.fecha, .nota, p, app: app, nota: reg.nota)
        e.producto = reg.producto
        switch reg.tipo {
        case .riego:
            if reg.producto == "Lluvia" {
                e.tipo = .lluvia
                e.producto = nil
                if let mm = reg.nota.flatMap({ numero(en: $0, unidad: "mm") }) {
                    e.cantidad = mm
                    e.unidad = "mm"
                    e.nota = nil
                }
            } else {
                e.tipo = .riego
                if let ml = reg.aguaML {
                    e.cantidad = Double(ml)
                    e.unidad = "ml"
                }
            }
        case .fertilizante:
            e.tipo = .fertilizante
            let ml = reg.fertilizanteML ?? reg.nota.flatMap { numero(en: $0, unidad: "ml") }
            if let ml {
                e.cantidad = ml
                e.unidad = "ml"
            }
            if let porLitro = reg.mlPorLitro, porLitro > 0 {
                e.dosis = porLitro
            } else if let ml, let agua = reg.aguaML, agua > 0 {
                e.dosis = (ml * 1000 / Double(agua) * 100).rounded() / 100
            }
            // La nota automática ("1,5 ml en 1,5 L") ya está en las columnas: se cambia por el agua.
            var partes: [String] = []
            if let agua = reg.aguaML { partes.append("Agua: \(agua) ml") }
            if let n = reg.nota, !esNotaAutomaticaDeFertilizante(n) { partes.append(n) }
            e.nota = partes.isEmpty ? nil : partes.joined(separator: ". ")
        case .neem:
            e.tipo = .neem
        case .nota:
            switch reg.subtipoEfectivo {
            case .ubicacion: e.tipo = .cambioUbicacion
            case .terminada: e.tipo = .finCurado
            case .descartada: e.tipo = .descarte
            case .polen, .semillasPropias: return nil
            case nil: e.tipo = .nota
            }
        case .problema:
            e.tipo = .problema
        case .sexo:
            e.tipo = .sexado
        case .polinizacion:
            e.tipo = .polinizacion
        case .cosecha:
            e.tipo = .cosecha
            e.cantidad = reg.nota.flatMap { numero(en: $0, unidad: "g") } ?? p.cosecha?.gramosHumedos
            e.unidad = e.cantidad == nil ? nil : "g"
            e.nota = "Empieza el secado"
        case .secado:
            e.tipo = .aFrascos
            e.cantidad = reg.nota.flatMap { numero(en: $0, unidad: "g") } ?? p.cosecha?.gramosSecos
            e.unidad = e.cantidad == nil ? nil : "g"
            e.nota = "Fin del secado"
        case .germinacion:
            e.tipo = .germinacion
            e.nota = "\(p.semilla.nombre), maceta de \(Formato.numero(p.litrosMaceta)) L, \(p.ubicacion.nombre.lowercased())"
        case .curado:
            e.tipo = .aperturaFrascos
        case .revision:
            e.tipo = .revision
        }
        return e
    }

    // MARK: Etapas

    /// Un evento por cada etapa de cultivo que ya empezó (sin contar plántula, que es la germinación).
    /// La fecha es el día en que empezó la etapa, no el día en que se detectó.
    public static func cambiosDeEtapa(_ datos: Datos, hoy: Date, app: String) -> [EventoSync] {
        var r: [EventoSync] = []
        for p in datos.plantas {
            let fin = min(finDelCultivo(p) ?? hoy, hoy)
            let diaFin = Calendario.dias(desde: p.fechaGerminacion, hasta: fin)
            let inicio = Calendario.inicioDelDia(p.fechaGerminacion)
            for t in Etapas.tramos(de: p) where t.duracion > 0 && t.desdeDia > 0 && t.desdeDia <= diaFin {
                var e = base(idEtapa(p.id, t.etapa), Calendario.sumarDias(t.desdeDia, a: inicio), .cambioEtapa, p,
                             app: app, nota: "Empieza \(t.etapa.nombre.lowercased())")
                e.etapa = t.etapa.nombre
                e.dia = t.desdeDia
                r.append(e)
            }
        }
        return r
    }

    /// Etapa y día de cultivo que tenía la planta en ese momento. En el instante exacto de la cosecha
    /// o del pase a frascos cuenta todavía la etapa anterior.
    public static func etapa(de p: Planta, en fecha: Date) -> (etapa: Etapa, dia: Int) {
        let dia = Calendario.dias(desde: p.fechaGerminacion, hasta: fecha)
        if let fin = fechaDe(p, .terminada), fecha > fin, p.estado == .terminada { return (.terminada, dia) }
        if let fin = fechaDe(p, .descartada), fecha > fin, p.estado == .descartada { return (.descartada, dia) }
        if let c = p.cosecha {
            if let ff = c.fechaFrascos, fecha > ff { return (.curado, dia) }
            if fecha > c.fecha { return (.secado, dia) }
        }
        return (Etapas.etapaDeCultivo(enDia: dia, tramos: Etapas.tramos(de: p)).etapa, dia)
    }

    // MARK: Historial completo ("Sincronizar todo")

    /// Todo lo que se puede reconstruir de los datos, con los mismos IDs que el envío normal.
    public static func historial(_ datos: Datos, hoy: Date, app: String) -> [EventoSync] {
        var r: [EventoSync] = []
        for p in datos.plantas {
            r += p.registros.compactMap { evento(de: $0, en: p, app: app) }
            r += p.fotos.map { eventoFoto($0, en: p, app: app) }
        }
        r += cambiosDeEtapa(datos, hoy: hoy, app: app)
        r += datos.paquetes.map { altaPaquete($0, datos: datos, app: app) }
        for polen in datos.polenes {
            r.append(eventoPolen(idPolen(polen.id), polen.fecha, .polenJuntado, polen, datos: datos,
                                 nota: polen.notas.isEmpty ? nil : polen.notas, app: app))
        }
        return r.sorted { $0.fecha < $1.fecha }
    }

    // MARK: Hoja "Plantas"

    public static func fila(_ p: Planta, hoy: Date, borrada: Bool = false) -> PlantaSync {
        let e = Etapas.estado(de: p, hoy: hoy)
        let ultimaNota = p.historial.first { r in
            (r.tipo == .nota && r.subtipoEfectivo == nil) || r.tipo == .problema
        }
        return PlantaSync(
            id: p.id.uuidString, nombre: p.nombre, variedad: p.variedad, autoFoto: autoFoto(p.tipo),
            semilla: p.semilla.nombre, sexo: p.sexo.nombre, ubicacion: p.ubicacion.nombre,
            litros: p.litrosMaceta, germinacion: Calendario.claveDia(p.fechaGerminacion),
            etapa: borrada ? "Borrada" : e.etapa.nombre, dia: e.dia,
            ultimoRiego: p.ultimaFecha([.riego, .fertilizante]), ultimoFertilizante: p.ultimaFecha([.fertilizante]),
            ultimoNeem: p.ultimaFecha([.neem]), estado: borrada ? "borrada" : p.estado.rawValue,
            gramosHumedos: p.cosecha?.gramosHumedos, gramosSecos: p.cosecha?.gramosSecos,
            notas: ultimaNota.map { r in
                "\(r.tipo == .problema ? "Problema" : "Nota") \(Formato.fechaCorta(r.fecha)): \(r.nota ?? "")"
            } ?? "",
            actualizado: hoy)
    }

    /// Filas de "Plantas" que cambiaron (incluye las borradas, con estado "borrada").
    public static func filasCambiadas(antes a: Datos, despues d: Datos, hoy: Date) -> [PlantaSync] {
        var r = d.plantas.filter { a.planta($0.id) != $0 }.map { fila($0, hoy: hoy) }
        r += a.plantas.filter { d.planta($0.id) == nil }.map { fila($0, hoy: hoy, borrada: true) }
        return r
    }

    // MARK: IDs

    public static func idEtapa(_ planta: UUID, _ etapa: Etapa) -> String { "etapa-\(planta.uuidString)-\(etapa.rawValue)" }
    public static func idFoto(_ nombre: String) -> String { "foto-\(nombre)" }
    public static func idPaquete(_ id: UUID) -> String { "semillas-\(id.uuidString)" }
    public static func idPolen(_ id: UUID) -> String { "polen-\(id.uuidString)" }

    // MARK: Ayudas

    static func autoFoto(_ t: TipoPlanta) -> String { t == .auto ? "Auto" : "Foto" }

    static func base(_ id: String, _ fecha: Date, _ tipo: TipoEvento, _ p: Planta, app: String,
                     nota: String? = nil) -> EventoSync {
        let momento = etapa(de: p, en: fecha)
        return EventoSync(id: id, fecha: fecha, tipo: tipo, plantaID: p.id.uuidString, planta: p.nombre,
                          variedad: p.variedad, autoFoto: autoFoto(p.tipo), etapa: momento.etapa.nombre,
                          dia: momento.dia, nota: nota, app: app)
    }

    static func eventoFoto(_ nombre: String, en p: Planta, app: String) -> EventoSync {
        base(idFoto(nombre), p.fechasFotos[nombre] ?? p.fechaGerminacion, .foto, p, app: app, nota: "Saqué una foto")
    }

    static func altaPaquete(_ pack: PaqueteSemillas, datos: Datos, app: String) -> EventoSync {
        var nota = "\(pack.banco) · \(pack.tipo.nombre) \(pack.semilla.nombre.lowercased())"
        if pack.propias { nota += " · propias" }
        return eventoPaquete(idPaquete(pack.id), pack.fechaCompra, .altaSemillas, pack, datos: datos,
                             cantidad: Double(pack.cantidad), nota: nota, app: app)
    }

    static func eventoPaquete(_ id: String, _ fecha: Date, _ tipo: TipoEvento, _ pack: PaqueteSemillas,
                              datos: Datos, cantidad: Double?, nota: String, app: String) -> EventoSync {
        var e: EventoSync
        if let madre = pack.plantaMadreID.flatMap({ datos.planta($0) }) {
            e = base(id, fecha, tipo, madre, app: app, nota: nota)
        } else {
            e = EventoSync(id: id, fecha: fecha, tipo: tipo, autoFoto: autoFoto(pack.tipo), nota: nota, app: app)
        }
        e.producto = pack.nombre
        e.cantidad = cantidad
        e.unidad = cantidad == nil ? nil : "semillas"
        return e
    }

    static func eventoPolen(_ id: String, _ fecha: Date, _ tipo: TipoEvento, _ polen: Polen, datos: Datos,
                            nota: String?, app: String) -> EventoSync {
        var e: EventoSync
        if let origen = polen.plantaOrigenID.flatMap({ datos.planta($0) }) {
            e = base(id, fecha, tipo, origen, app: app, nota: nota)
        } else {
            e = EventoSync(id: id, fecha: fecha, tipo: tipo, planta: polen.plantaOrigen, nota: nota, app: app)
        }
        e.producto = "Polen de \(polen.plantaOrigen)"
        return e
    }

    static func tareaSalteada(_ tareaID: String, datos: Datos, ahora: Date, id: String, app: String) -> EventoSync {
        // El ID de tarea es "<tipo>-<uuid de la planta>".
        let partes = tareaID.split(separator: "-", maxSplits: 1).map(String.init)
        let nombre = nombreTarea[partes.first ?? ""] ?? (partes.first ?? tareaID)
        let nota = "Hoy no: \(nombre)"
        if partes.count == 2, let uuid = UUID(uuidString: partes[1]), let p = datos.planta(uuid) {
            return base(id, ahora, .tareaSalteada, p, app: app, nota: nota)
        }
        return EventoSync(id: id, fecha: ahora, tipo: .tareaSalteada, nota: nota, app: app)
    }

    static let nombreTarea: [String: String] = [
        "machoPatio": "llevar el macho adentro", "cosecha": "revisar tricomas", "hongos": "revisar hongos",
        "sexado": "revisar el sexo", "machoPolen": "juntar polen", "semillas": "revisar semillas",
        "fertilizante": "fertilizar", "riego": "regar", "neem": "neem", "secado": "probar los tallitos",
        "curado": "abrir los frascos",
    ]

    /// Cuándo dejó de ser una planta viva (cosecha, fin o descarte), si ya pasó.
    static func finDelCultivo(_ p: Planta) -> Date? {
        if let c = p.cosecha { return c.fecha }
        switch p.estado {
        case .terminada: return fechaDe(p, .terminada)
        case .descartada: return fechaDe(p, .descartada)
        default: return nil
        }
    }

    static func fechaDe(_ p: Planta, _ subtipo: SubtipoRegistro) -> Date? {
        p.registros.filter { $0.subtipoEfectivo == subtipo }.map(\.fecha).max()
    }

    static func cambiosDeDatos(_ a: Planta, _ b: Planta, conSexo: Bool) -> [String] {
        var c: [String] = []
        if a.nombre != b.nombre { c.append("nombre: \(a.nombre) → \(b.nombre)") }
        if a.variedad != b.variedad { c.append("variedad: \(a.variedad) → \(b.variedad)") }
        if a.tipo != b.tipo { c.append("tipo: \(a.tipo.nombre) → \(b.tipo.nombre)") }
        if a.semilla != b.semilla { c.append("semilla: \(a.semilla.nombre) → \(b.semilla.nombre)") }
        if conSexo, a.sexo != b.sexo { c.append("sexo: \(a.sexo.nombre) → \(b.sexo.nombre)") }
        if a.litrosMaceta != b.litrosMaceta {
            c.append("maceta: \(Formato.numero(a.litrosMaceta)) → \(Formato.numero(b.litrosMaceta)) L")
        }
        if !Calendario.mismoDia(a.fechaGerminacion, b.fechaGerminacion) {
            c.append("germinación: \(Formato.fechaCorta(a.fechaGerminacion)) → \(Formato.fechaCorta(b.fechaGerminacion))")
        }
        return c
    }

    /// "Riego 8/11/2026, 1500 ml, «nota»".
    static func resumen(_ r: Registro) -> String {
        var partes = ["\(r.tipo.nombre) \(Formato.fechaCorta(r.fecha))"]
        if let p = r.producto, !p.isEmpty { partes.append(p) }
        if let a = r.aguaML { partes.append("\(a) ml") }
        if let n = r.nota, !n.isEmpty { partes.append("«\(n)»") }
        return partes.joined(separator: ", ")
    }

    /// El número del principio si el texto es "<número> <unidad>…" (ej. "12,5 g húmedos", "8 mm").
    static func numero(en texto: String, unidad: String) -> Double? {
        let palabras = texto.split(separator: " ")
        guard palabras.count >= 2, palabras[1] == Substring(unidad) else { return nil }
        return Double(palabras[0].replacingOccurrences(of: ",", with: "."))
    }

    static func esNotaAutomaticaDeFertilizante(_ n: String) -> Bool {
        numero(en: n, unidad: "ml") != nil && n.contains(" ml en ")
    }
}
