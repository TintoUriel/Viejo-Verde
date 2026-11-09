import Foundation
@testable import ViejoVerdeCore

func f(_ a: Int, _ m: Int, _ d: Int) -> Date { Calendario.fecha(a, m, d) }

/// Hoy fijo para los tests de tareas.
let hoyTest = f(2026, 11, 20)

func hace(_ dias: Int, _ desde: Date = hoyTest) -> Date { Calendario.sumarDias(-dias, a: desde) }

func auto(dia: Int, semilla: TipoSemilla = .feminizada, sexo: Sexo? = nil, ubicacion: Ubicacion = .patio,
          registros: [Registro] = [], nombre: String = "Banana") -> Planta {
    Planta(nombre: nombre, variedad: "Banana Blaze", tipo: .auto, semilla: semilla, sexo: sexo,
           ubicacion: ubicacion, fechaGerminacion: hace(dia), registros: registros)
}

func reg(_ tipo: TipoRegistro, hace dias: Int, producto: String? = nil) -> Registro {
    Registro(fecha: hace(dias), tipo: tipo, producto: producto)
}
