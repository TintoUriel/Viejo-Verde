import Foundation
import Security

/// La API key de Anthropic vive en el llavero (Keychain) del iPhone, nunca en el código ni en el JSON.
enum Llavero {
    private static let servicio = "com.tinto.viejoverde"
    private static let cuenta = "anthropic-api-key"

    private static var base: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
        ]
    }

    static func leerClave() -> String? {
        var q = base
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultado: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &resultado) == errSecSuccess,
              let data = resultado as? Data,
              let clave = String(data: data, encoding: .utf8),
              !clave.isEmpty else { return nil }
        return clave
    }

    @discardableResult
    static func guardarClave(_ clave: String) -> Bool {
        borrarClave()
        var q = base
        q[kSecValueData as String] = Data(clave.utf8)
        // Solo en este iPhone (no viaja a backups de iCloud ni a otros dispositivos).
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func borrarClave() {
        SecItemDelete(base as CFDictionary)
    }
}
