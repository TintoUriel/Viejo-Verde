import Foundation
import Security

/// Los secretos viven en el llavero (Keychain) del iPhone, nunca en el código ni en el JSON:
/// la API key de Anthropic y la URL y el token de la planilla de Google.
enum Llavero {
    enum Cuenta: String {
        case anthropic = "anthropic-api-key"
        case planillaURL = "sheets-webapp-url"
        case planillaToken = "sheets-token"
    }

    private static let servicio = "com.tinto.viejoverde"

    private static func base(_ cuenta: Cuenta) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta.rawValue,
        ]
    }

    static func leer(_ cuenta: Cuenta) -> String? {
        var q = base(cuenta)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultado: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &resultado) == errSecSuccess,
              let data = resultado as? Data,
              let valor = String(data: data, encoding: .utf8),
              !valor.isEmpty else { return nil }
        return valor
    }

    @discardableResult
    static func guardar(_ valor: String, en cuenta: Cuenta) -> Bool {
        borrar(cuenta)
        var q = base(cuenta)
        q[kSecValueData as String] = Data(valor.utf8)
        // Solo en este iPhone (no viaja a backups de iCloud ni a otros dispositivos). "AfterFirstUnlock"
        // para que la sincronización en segundo plano pueda leerlo con el teléfono bloqueado.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func borrar(_ cuenta: Cuenta) {
        SecItemDelete(base(cuenta) as CFDictionary)
    }

    // MARK: API key de Anthropic (lo que ya usaba la app)

    static func leerClave() -> String? { leer(.anthropic) }

    @discardableResult
    static func guardarClave(_ clave: String) -> Bool { guardar(clave, en: .anthropic) }

    static func borrarClave() { borrar(.anthropic) }
}
