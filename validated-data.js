// Lectura verificada de Reportes SG Molienda el 24/09/2026.
// La hoja conectada, cuando se habilita el puente Apps Script, prevalece sobre esta copia.
export const VALIDATED = {
  operadores: [
    ['Agudo, Jose Emanuel','Operario de Molienda'],
    ['Albornoz, Patricio Exequiel','Maquinista'],
    ['Gianfracisco, Pablo Matias','Maquinista, Operario de Molienda, Sacapiedras, Regador'],
    ['Gil, Alfredo Maximiliano','Operario de Molienda, Sacapiedras'],
    ['Guardia, Ruben Gustavo','Operario de Molienda, Sacapiedras'],
    ['Ibarra, Cristian Omar','Maquinista'],
    ['Juárez, Nelsón','Operario de Molienda, Sacapiedras'],
    ['Madrid, Nicolás','Regador'],
    ['Molina, Fredy Rolando','Maquinista'],
    ['Moreno, José','Operario de Molienda, Sacapiedras'],
    ['Moyano, Victor','Operario de Molienda, Sacapiedras'],
    ['Olmos, Cristian','Maquinista'],
    ['Rivas, Andrés','Maquinista'],
    ['Sánchez, Mario Walter','Maquinista'],
    ['Santillán, Daniel Orlando','Maquinista'],
    ['Trejo, Juan','Maquinista'],
    ['Varela, Daniel Jesus','Maquinista'],
    ['Villagra, Nicolás','Operario de Molienda'],
    ['Yñiguez, Cristian','Operario de Molienda, Sacapiedras']
  ].map(([nombre, puestos], i) => ({ id: i + 1, nombre, puestosHabilitados: puestos.split(', '), activo: true })),
  maquinas: [['CAT 938 H',3],['CAT 938 G',3],['KOM 430',4],['LON 856',3],['LIU 855',3]]
    .map(([nombre, m3PorPalada], i) => ({ id: i + 1, nombre, m3PorPalada, activo: true })),
  canteras: [['Cantera del Chañar','Cantera'],['Excavación B° Congreso','Excavación'],
    ['Excavación Los Nogales','Excavación'],['Excavación Viento Sur','Excavación']]
    .map(([nombre, tipo], i) => ({ id: i + 1, nombre, tipo, activo: true })),
  sectores: [['Entrada Playa / Balanza','A1'],['Calle Lateral','A2'],['Galpón Viejo','A3'],
    ['Playa Logística Central','B1'],['Costado Molienda','B2'],['Badén Silo','B3'],
    ['Frente al Taller','C1'],['Estibas Sur','C2'],['Zona Conos Silo','C3']]
    .map(([nombre, cuadrante], i) => ({ id: i + 1, nombre, cuadrante, activo: true })),
  acciones: ['Retiro Descartes','Nivelación Terreno','Regado','Desbarrado','Limpieza',
    'Raspar Barro','Rellenar con Roturas'].map((nombre, i) => ({ id: i + 1, nombre, activo: true })),
  acopios: [
    { id: 1, nombre: 'Acopio Mezcla', sector: 'Costado Molienda', cuadrante: 'B2',
      pisos: 2, toneladas: 850, m3Estimados: 566.7, posX: 275, posY: 210, radioBase: 36, largoEje: 48 },
    { id: 2, nombre: 'Acopio Tosca Seleccionada', sector: 'Playa Logística Central', cuadrante: 'B1',
      pisos: 1, toneladas: 320, m3Estimados: 213.3, posX: 490, posY: 135, radioBase: 28, largoEje: 38 },
    { id: 3, nombre: 'Acopio Recortes', sector: 'Estibas Sur', cuadrante: 'C2',
      pisos: 1, toneladas: 180, m3Estimados: 120, posX: 730, posY: 225, radioBase: 26, largoEje: 34 }
  ].map(a => ({ ...a, paladas: 0, origenReceta: '', textura: { arcilla: 0, arena: 0, limo: 0 },
    calidades: {}, activo: true, esFuturo: false }))
};
