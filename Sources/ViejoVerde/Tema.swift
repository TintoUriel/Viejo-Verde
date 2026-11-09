import SwiftUI
import UIKit
import ViejoVerdeCore

/// Identidad de la app: verde hoja para las etapas, ámbar (tricoma maduro) como acento.
enum Tema {
    static let verde = dinamico(claro: 0x2E7D3A, oscuro: 0x5CC46A)
    static let verdeSuave = dinamico(claro: 0xE3F1E4, oscuro: 0x1C2E1F)
    static let ambar = dinamico(claro: 0xB86E00, oscuro: 0xF2A93B)
    static let ambarSuave = dinamico(claro: 0xFBEFD9, oscuro: 0x3A2A10)
    static let alerta = Color.red
    static let fondo = Color(uiColor: .systemGroupedBackground)
    static let tarjeta = Color(uiColor: .secondarySystemGroupedBackground)

    /// Color de cada etapa en la barra: de verde claro a ámbar a medida que madura.
    static func color(_ etapa: Etapa) -> Color {
        switch etapa {
        case .plantula: dinamico(claro: 0x8CCB90, oscuro: 0x7FBF85)
        case .crecimiento: dinamico(claro: 0x43A047, oscuro: 0x5CC46A)
        case .prefloracion: dinamico(claro: 0x2E7D3A, oscuro: 0x3E9E4C)
        case .floracion: dinamico(claro: 0x6B8E23, oscuro: 0x8DB33A)
        case .maduracion: dinamico(claro: 0xC9A227, oscuro: 0xD8B23A)
        case .listaCosecha: ambar
        case .secado, .curado: dinamico(claro: 0x8D6E63, oscuro: 0xA1887F)
        case .terminada, .descartada: Color.gray
        }
    }

    private static func dinamico(claro: UInt32, oscuro: UInt32) -> Color {
        Color(uiColor: UIColor { rasgos in
            rasgos.userInterfaceStyle == .dark ? UIColor(hex: oscuro) : UIColor(hex: claro)
        })
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}

// MARK: - Íconos

extension TipoTarea {
    var icono: String {
        switch self {
        case .machoPatio: "exclamationmark.triangle.fill"
        case .cosecha: "scissors"
        case .hongos: "allergens"
        case .sexado: "questionmark.circle.fill"
        case .machoPolen: "aqi.medium"
        case .semillas: "circle.grid.3x3.fill"
        case .fertilizante: "flask.fill"
        case .riego: "drop.fill"
        case .neem: "sparkles"
        case .secado: "wind"
        case .curado: "takeoutbag.and.cup.and.straw.fill"
        }
    }
}

extension AccionTarea {
    var icono: String {
        switch self {
        case .regue: "drop.fill"
        case .fertilice: "flask.fill"
        case .neem: "sparkles"
        case .hembra: "f.circle.fill"
        case .macho: "m.circle.fill"
        case .moverAdentro: "house.fill"
        case .juntePolen: "aqi.medium"
        case .registrarSemillas: "circle.grid.3x3.fill"
        case .cosechar: "scissors"
        case .aFrascos: "takeoutbag.and.cup.and.straw.fill"
        case .abriFrascos: "lock.open.fill"
        case .terminar: "checkmark.seal.fill"
        case .revise: "checkmark.circle.fill"
        case .hoyNo: "moon.zzz.fill"
        }
    }
}

extension TipoRegistro {
    var icono: String {
        switch self {
        case .riego: "drop.fill"
        case .fertilizante: "flask.fill"
        case .neem: "sparkles"
        case .nota: "note.text"
        case .problema: "exclamationmark.bubble.fill"
        case .sexo: "questionmark.circle.fill"
        case .polinizacion: "aqi.medium"
        case .cosecha: "scissors"
        case .secado: "takeoutbag.and.cup.and.straw.fill"
        case .germinacion: "leaf.fill"
        case .curado: "lock.open.fill"
        case .revision: "eye.fill"
        }
    }

    var color: Color {
        switch self {
        case .riego: .blue
        case .fertilizante: Tema.verde
        case .neem: .teal
        case .problema: .red
        case .cosecha, .secado, .curado: Tema.ambar
        default: .secondary
        }
    }
}
