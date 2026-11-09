import Foundation

/// Datos de ejemplo para probar la app. Se cargan en un almacén aparte, nunca sobre los datos reales.
public enum Ejemplo {
    public static func datos(hoy: Date) -> Datos {
        func hace(_ dias: Int) -> Date { Calendario.sumarDias(-dias, a: hoy) }
        var d = Datos()

        let packBanana = PaqueteSemillas(nombre: "Banana Blaze", banco: "Dutch Passion", tipo: .auto,
                                         semilla: .feminizada, cantidad: 5, fechaCompra: hace(120))
        let packReg = PaqueteSemillas(nombre: "Auto regular", banco: "Banco ejemplo", tipo: .auto,
                                      semilla: .regular, cantidad: 6, fechaCompra: hace(90))
        d.paquetes = [packBanana, packReg]

        // Banana 1: en crecimiento, le toca agua y Top Veg.
        var b1 = Planta(nombre: "Banana 1", variedad: "Banana Blaze", tipo: .auto, semilla: .feminizada,
                        fechaGerminacion: hace(15))
        b1.registros = [Registro(fecha: hace(3), tipo: .riego, aguaML: 1000),
                        Registro(fecha: hace(8), tipo: .fertilizante, producto: "Top Veg")]
        d.agregarPlanta(b1, desdePaquete: packBanana.id)

        // Banana 2: en floración.
        var b2 = Planta(nombre: "Banana 2", variedad: "Banana Blaze", tipo: .auto, semilla: .feminizada,
                        fechaGerminacion: hace(48))
        b2.registros = [Registro(fecha: hace(1), tipo: .riego, aguaML: 3000),
                        Registro(fecha: hace(4), tipo: .fertilizante, producto: "Top Bloom"),
                        Registro(fecha: hace(2), tipo: .nota, nota: "Muchos pelitos blancos, huele rico")]
        d.agregarPlanta(b2, desdePaquete: packBanana.id)

        // Banana 3: madurando, toca revisar tricomas.
        var b3 = Planta(nombre: "Banana 3", variedad: "Banana Blaze", tipo: .auto, semilla: .feminizada,
                        fechaGerminacion: hace(76))
        b3.registros = [Registro(fecha: hace(2), tipo: .riego, aguaML: 3000)]
        d.agregarPlanta(b3, desdePaquete: packBanana.id)

        // Regular 1: día 23, sin sexar.
        d.agregarPlanta(Planta(nombre: "Regular 1", variedad: "Auto regular", tipo: .auto, semilla: .regular,
                               fechaGerminacion: hace(23)), desdePaquete: packReg.id)

        // Regular 2: macho, todavía en el patio (alerta).
        var r2 = Planta(nombre: "Regular 2", variedad: "Auto regular", tipo: .auto, semilla: .regular,
                        sexo: .macho, fechaGerminacion: hace(27))
        r2.registros = [Registro(fecha: hace(1), tipo: .riego)]
        d.agregarPlanta(r2, desdePaquete: packReg.id)

        // Una secando y otra curando.
        var s = Planta(nombre: "Banana vieja", variedad: "Banana Blaze", tipo: .auto, semilla: .feminizada,
                       fechaGerminacion: hace(100))
        s.estado = .secando
        s.cosecha = Cosecha(fecha: hace(8), gramosHumedos: 180)
        d.agregarPlanta(s)

        var c = Planta(nombre: "Banana curada", variedad: "Banana Blaze", tipo: .auto, semilla: .feminizada,
                       fechaGerminacion: hace(120))
        c.estado = .curando
        c.cosecha = Cosecha(fecha: hace(25), gramosHumedos: 200, fechaFrascos: hace(10), gramosSecos: 48)
        d.agregarPlanta(c)

        d.polenes = [Polen(fecha: hace(200), plantaOrigen: "Macho viejo (Auto regular)", notas: "Sobre en frasco con arroz")]
        return d
    }
}
