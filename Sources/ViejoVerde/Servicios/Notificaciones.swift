import Foundation
import UIKit
import UserNotifications
import ViejoVerdeCore

/// Programa las notificaciones locales a partir del plan que calcula ViejoVerdeCore.
@MainActor
enum Notificaciones {
    static var centro: UNUserNotificationCenter { .current() }

    /// Pide permiso (la primera vez muestra el cartel de iOS).
    static func pedirPermiso() async -> Bool {
        (try? await centro.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func estado() async -> UNAuthorizationStatus {
        await centro.notificationSettings().authorizationStatus
    }

    /// Borra las notificaciones de la app que estaban pendientes y programa las nuevas.
    static func reprogramar(_ datos: Datos) async {
        let pendientes = await centro.pendingNotificationRequests()
        let nuestras = pendientes.map(\.identifier).filter { $0.hasPrefix(PlanNotificaciones.prefijo) }
        centro.removePendingNotificationRequests(withIdentifiers: nuestras)

        let estado = await estado()
        guard estado == .authorized || estado == .provisional else { return }

        for n in PlanNotificaciones.planificar(datos: datos, ahora: Date()) {
            let segundos = n.fecha.timeIntervalSinceNow
            guard segundos > 1 else { continue }
            let contenido = UNMutableNotificationContent()
            contenido.title = n.titulo
            contenido.body = n.cuerpo
            contenido.sound = .default
            let disparador = UNTimeIntervalNotificationTrigger(timeInterval: segundos, repeats: false)
            try? await centro.add(UNNotificationRequest(identifier: n.id, content: contenido, trigger: disparador))
        }
    }

    /// Notificación de prueba en 5 segundos.
    static func probar() async {
        guard await pedirPermiso() else { return }
        let contenido = UNMutableNotificationContent()
        contenido.title = "Viejo Verde"
        contenido.body = "Así te van a llegar los avisos 🌱"
        contenido.sound = .default
        let disparador = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        try? await centro.add(UNNotificationRequest(identifier: "\(PlanNotificaciones.prefijo)prueba",
                                                    content: contenido, trigger: disparador))
    }

    static func abrirAjustesDelSistema() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

/// Permite ver las notificaciones aunque la app esté abierta.
final class DelegadoApp: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}
