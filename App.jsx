"use client";
import React, { useState, useEffect, useRef } from 'react';
import { VALIDATED } from './lib/validated-data.js';
import { describirPronostico } from './lib/weather.js';
import { WEATHER_LOCATIONS, nearestWeatherLocation } from './lib/weather-locations.js';

// ============================================================================
// GESTION MOLIENDA • CERÁMICA MARCOS PAZ
// Sistema MES 4.0 - Relevamiento CAD Satelital: 8,817.24 m² • Cám. del Perú 400 m
// ============================================================================

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0KsVei3Nz-z9qpEu-Pot10qEKTQKJqOl93wsTXdOWHaCM80jnw-wqrTRPrS8zue36/exec";
const SHEET_PRINCIPAL_URL = 'https://docs.google.com/spreadsheets/d/1hiCNaOYxxEYfpkLci6J0wFBxXuhOyShApOIJTMo6k60/edit?gid=1680149786';
const SHEET_HISTORICA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTahPDQ0JWVDhx7bb74pxh3wNa3rORRCBIqFqBEiavIiKN6CjlQyAQXF9TLLSkQZp1uC0t62774yPEv/pub?gid=1381238472&single=true&output=csv';
const STORAGE_KEY = "gestion-molienda-mes-v2";
const fechaLocal = () => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const valor = tipo => partes.find(parte => parte.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
};
const nuevoId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const numero = (valor) => Number.isFinite(Number(valor)) ? Number(valor) : 0;
const redondear = (valor) => Math.round((valor + Number.EPSILON) * 100) / 100;
const clave = (valor) => String(valor ?? '').trim().toLocaleLowerCase('es-AR');
const partesOperario = op => {
  if (op.apellidos !== undefined || op.nombres !== undefined) return { apellidos: op.apellidos ?? '', nombres: op.nombres ?? '' };
  const nombre = String(op.nombre ?? '').trim();
  if (nombre.includes(',')) { const [apellidos, ...nombres] = nombre.split(','); return { apellidos: apellidos.trim(), nombres: nombres.join(',').trim() }; }
  const [apellidos, ...nombres] = nombre.split(/\s+/);
  return { apellidos: apellidos ?? '', nombres: nombres.join(' ') };
};
const esCajon3 = (valor) => clave(valor) === clave('Cajón 3 - En Producción');
const esCajon1 = (valor) => clave(valor) === clave('Cajón 1 - Consumo Silo');
const esCajon2 = (valor) => clave(valor) === clave('Cajón 2 - Entrada Silo');
// Fracciones de agua sobre masa seca: escalones operativos provisorios hasta medir muestras locales.
const HUMEDAD_GRAVIMETRICA = [0, 10, 15, 20];
const nivelHumedad = valor => Math.max(0, Math.min(3, Math.round(numero(valor))));
const densidadPorHumedad = (densidadNominal, nivel) =>
  redondear(numero(densidadNominal) * (1 + HUMEDAD_GRAVIMETRICA[nivelHumedad(nivel)] / 100) / 1.10);
const normalizarTextura = (textura, campo, valor) => {
  const claves = ['arcilla', 'arena', 'limo'];
  const elegido = Math.max(0, Math.min(100, Math.round(numero(valor))));
  const restantes = claves.filter(k => k !== campo);
  const previo = restantes.map(k => Math.max(0, numero(textura?.[k])));
  const suma = previo[0] + previo[1];
  const primero = suma ? Math.round((100 - elegido) * previo[0] / suma) : Math.round((100 - elegido) / 2);
  return { ...textura, [campo]: elegido, [restantes[0]]: primero, [restantes[1]]: 100 - elegido - primero };
};
const inventariosEquivalentes = (a, b) => {
  if (!a || !b) return !a && !b;
  const filas = data => [...(data.acopios ?? []).map(x => ['a', clave(x.nombre), redondear(numero(x.toneladas))]),
    ...(data.conos ?? []).map(x => ['s', clave(x.nombre), redondear(numero(x.toneladas))])]
    .sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
  return redondear(numero(a.cajon2)) === redondear(numero(b.cajon2)) &&
    JSON.stringify(filas(a)) === JSON.stringify(filas(b));
};
const diferenciaMinutosHorario = (previsto, real) => {
  if (!/^\d{2}:\d{2}$/.test(previsto ?? '') || !/^\d{2}:\d{2}$/.test(real ?? '')) return null;
  const minutos = hora => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  let diferencia = minutos(real) - minutos(previsto);
  if (diferencia > 720) diferencia -= 1440;
  if (diferencia < -720) diferencia += 1440;
  return diferencia;
};
const errorAsistencia = p => {
  if (p.estado === 'ausente') return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.inicioReal ?? '') ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.finReal ?? '')) return 'Completá entrada y salida reales.';
  const entrada = diferenciaMinutosHorario(p.inicio, p.inicioReal);
  const salida = diferenciaMinutosHorario(p.fin, p.finReal);
  if (p.estado === 'llegada_tarde' && !(entrada > 0)) return 'La entrada debe ser posterior a la planificada.';
  if (p.estado === 'llegada_temprana' && !(entrada < 0)) return 'La entrada debe ser anterior a la planificada.';
  if (p.estado === 'retiro_temprano' && !(salida < 0)) return 'La salida debe ser anterior a la planificada.';
  if (p.estado === 'extras' && !(entrada < 0 || salida > 0)) return 'Las horas extra requieren entrada anterior o salida posterior.';
  if (p.estado === 'horario_modificado' && entrada === 0 && salida === 0) return 'Indicá al menos un horario distinto.';
  if (p.estado === 'cumplio' && (entrada !== 0 || salida !== 0)) return 'Registrá la variación del horario.';
  return '';
};

function calcularBalanceJornada({ playa, silos, cajon2, ingresos, movimientos, transferenciasConos = [], maquinas, densidad }) {
  const acopios = (playa ?? []).map(a => ({ ...a }));
  const conos = (silos ?? []).map(s => ({ ...s }));
  const nombres = acopios.map(a => clave(a.nombre));
  if (nombres.some((nombre, i) => !nombre || nombres.indexOf(nombre) !== i))
    throw new Error('Los acopios deben tener nombres únicos y no vacíos.');
  let saldoCajon2 = numero(cajon2);
  let consumo = 0;
  let despacho = 0;
  const traza = [];
  const densidadValida = numero(densidad);
  if (densidadValida <= 0) throw new Error('Configurá una densidad mayor que cero.');

  for (const ingreso of ingresos ?? []) {
    if (ingreso.ingresaronViajes === null || ingreso.ingresaronViajes === undefined) {
      throw new Error(`Confirmá los viajes de ${ingreso.origen}.`);
    }
    if (!ingreso.ingresaronViajes) continue;
    const toneladas = Number(ingreso.volumenRealTon);
    if (!Number.isFinite(toneladas) || toneladas < 0) throw new Error(`Tonelaje inválido para ${ingreso.origen}.`);
    if (esCajon2(ingreso.destino)) saldoCajon2 += toneladas;
    else {
      const destino = acopios.find(a => clave(a.nombre) === clave(ingreso.destino));
      if (!destino) throw new Error(`Destino de ingreso inexistente: ${ingreso.destino}.`);
      const previo = numero(destino.toneladas);
      destino.toneladas = numero(destino.toneladas) + toneladas;
      if (toneladas > 0) destino.esFuturo = false;
      if (toneladas > 0 && ingreso.calidadesEvaluadas?.Humedad !== undefined)
        destino.calidades = { ...destino.calidades,
          Humedad: nivelHumedad((nivelHumedad(destino.calidades?.Humedad) * previo +
            nivelHumedad(ingreso.calidadesEvaluadas.Humedad) * toneladas) / (previo + toneladas)) };
    }
  }

  for (const mov of movimientos ?? []) {
    const paladas = Number(mov.cantPaladas);
    if (!Number.isInteger(paladas) || paladas < 0) throw new Error('Las paladas deben ser enteras y no negativas.');
    if (paladas === 0) continue;
    const maquina = (maquinas ?? []).find(m => clave(m.nombre) === clave(mov.maquina));
    const balde = numero(maquina?.m3PorPalada ?? 3);
    if (balde <= 0) throw new Error(`Capacidad de balde inválida para ${mov.maquina}.`);
    if (esCajon2(mov.origen)) throw new Error('Cajón 2 no puede ser origen: seleccioná el acopio que aportó la tierra.');
    const origenPlaya = acopios.find(a => clave(a.nombre) === clave(mov.origen));
    const origenSilo = conos.find(s => s.activo !== false && clave(s.nombre) === clave(mov.origen));
    if (!origenPlaya && !origenSilo) throw new Error(`Origen de movimiento inexistente: ${mov.origen}.`);
    const origen = origenPlaya ?? origenSilo;
    const humedad = origenPlaya?.calidades?.Humedad ?? origenSilo?.humedadNivel ?? 1;
    const toneladas = redondear(paladas * balde * densidadPorHumedad(densidadValida, humedad));
    if (numero(origen.toneladas) + 1e-8 < toneladas) {
      throw new Error(`Stock insuficiente en ${origen.nombre}: se requieren ${toneladas} t.`);
    }
    const destinoSilo = conos.find(s => s.activo !== false && clave(s.nombre) === clave(mov.destino));
    const destinoValido = origenSilo
      ? (esCajon1(mov.destino) || esCajon3(mov.destino) || clave(mov.destino) === clave('CMP Yerba Buena'))
      : (destinoSilo || esCajon2(mov.destino) || esCajon3(mov.destino));
    if (!destinoValido) throw new Error(`Ruta no permitida: ${mov.origen} → ${mov.destino}.`);
    origen.toneladas = redondear(numero(origen.toneladas) - toneladas);
    if (origenSilo) origenSilo.paladasOperativas = Math.max(0, numero(origenSilo.paladasOperativas) - paladas);
    if (destinoSilo) {
      const previo = numero(destinoSilo.toneladas);
      destinoSilo.toneladas = redondear(previo + toneladas);
      destinoSilo.paladasOperativas = numero(destinoSilo.paladasOperativas) + paladas;
      destinoSilo.humedadNivel = nivelHumedad((nivelHumedad(destinoSilo.humedadNivel ?? 1) * previo +
        nivelHumedad(humedad) * toneladas) / (previo + toneladas));
    }
    else if (esCajon2(mov.destino)) saldoCajon2 += toneladas;
    else if (esCajon1(mov.destino) || esCajon3(mov.destino)) consumo += toneladas;
    else despacho += toneladas;
    traza.push({ id: mov.id, origen: mov.origen, destino: mov.destino,
      paladas, volumenM3: redondear(paladas * balde),
      densidadAplicada: densidadPorHumedad(densidadValida, humedad),
      humedadNivel: nivelHumedad(humedad), toneladas });
  }
  for (const transferencia of transferenciasConos) {
    const origen = conos.find(s => String(s.id) === String(transferencia.origenId) && s.activo !== false);
    const destino = conos.find(s => String(s.id) === String(transferencia.destinoId) && s.activo !== false);
    if (!origen || !destino || origen.id === destino.id) throw new Error('Seleccioná un cono de origen y otro de destino para el traspaso.');
    const toneladas = redondear(numero(origen.toneladas));
    const paladas = numero(origen.paladasOperativas);
    if (toneladas <= 0 && paladas <= 0) throw new Error(`${origen.nombre} no tiene remanente para trasladar.`);
    const previo = numero(destino.toneladas);
    destino.toneladas = redondear(previo + toneladas);
    destino.paladasOperativas = numero(destino.paladasOperativas) + paladas;
    destino.humedadNivel = nivelHumedad((nivelHumedad(destino.humedadNivel ?? 1) * previo +
      nivelHumedad(origen.humedadNivel ?? 1) * toneladas) / Math.max(.01, previo + toneladas));
    origen.toneladas = 0;
    origen.paladasOperativas = 0;
    traza.push({ id: transferencia.id, tipo: 'traspaso', origen: origen.nombre, destino: destino.nombre,
      paladas, toneladas, volumenM3: null, observacion: transferencia.motivo || 'Puesta en cero con traspaso' });
  }
  for (const acopio of acopios) {
    acopio.toneladas = redondear(numero(acopio.toneladas));
    acopio.m3Estimados = redondear(acopio.toneladas / densidadPorHumedad(densidadValida, acopio.calidades?.Humedad ?? 1));
    acopio.paladas = Math.round(acopio.m3Estimados / 3);
  }
  return { acopios, conos, cajon2: redondear(saldoCajon2), consumo: redondear(consumo),
    despacho: redondear(despacho), traza };
}

const Icons = {
  Factory: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  Calendar: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Check: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Users: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Truck: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  Database: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Alert: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Map: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
  Plus: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Trash: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  ArrowRight: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  Shield: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Sun: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Moon: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
  Clock: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Bell: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  Settings: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Camera: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Layers: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  X: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
};

const ROLES_OPERATIVOS = [
  "Operario de Molienda",
  "Regador",
  "Sacapiedras",
  "Maquinista"
];

const TURNOS_CONFIG = {
  T1: { id: "T1", nombre: "Turno 1 (Noche)", defaultInicio: "22:00", defaultFin: "06:00", color: "indigo" },
  T2: { id: "T2", nombre: "Turno 2 (Mañana)", defaultInicio: "06:00", defaultFin: "14:00", color: "cyan" },
  T3: { id: "T3", nombre: "Turno 3 (Tarde)", defaultInicio: "14:00", defaultFin: "22:00", color: "amber" }
};

const OPERARIOS_BASE = [
  { id: 1, nombre: "Díaz, José", activo: true, puestosHabilitados: ["Maquinista", "Operario de Molienda", "Regador"] },
  { id: 2, nombre: "Trejo, Juan", activo: true, puestosHabilitados: ["Maquinista", "Sacapiedras"] },
  { id: 3, nombre: "Olmos, Cristian", activo: true, puestosHabilitados: ["Sacapiedras", "Operario de Molienda"] },
  { id: 4, nombre: "Albornoz, Patricio", activo: true, puestosHabilitados: ["Operario de Molienda", "Regador"] },
  { id: 5, nombre: "Rivas, Andrés", activo: true, puestosHabilitados: ["Regador", "Sacapiedras"] },
  { id: 6, nombre: "Carlorrosi, Martín", activo: true, puestosHabilitados: ["Maquinista", "Operario de Molienda"] },
  { id: 7, nombre: "Radi, Lucas", activo: true, puestosHabilitados: ["Operario de Molienda", "Sacapiedras"] },
  { id: 8, nombre: "Lobo, Carlos", activo: true, puestosHabilitados: ["Maquinista", "Regador"] },
  { id: 9, nombre: "Moyano, Facundo", activo: true, puestosHabilitados: ["Operario de Molienda", "Sacapiedras", "Regador"] }
];

const MAQUINAS_BASE = [
  { id: 1, nombre: "CAT 938 H (N°6)", m3PorPalada: 3.0, activo: true },
  { id: 2, nombre: "CAT 938 G", m3PorPalada: 3.0, activo: true },
  { id: 3, nombre: "LON 856", m3PorPalada: 3.0, activo: true },
  { id: 4, nombre: "LIU ZL50", m3PorPalada: 3.0, activo: true }
];

const CANTERAS_BASE = [
  { id: 1, nombre: "Cantera del Chañar", tipo: "Cantera", activo: true },
  { id: 2, nombre: "Excavación B° Congreso", tipo: "Excavación", activo: true },
  { id: 3, nombre: "Excavación Los Nogales", tipo: "Excavación", activo: true },
  { id: 4, nombre: "Excavación Viento Sur", tipo: "Excavación", activo: true }
];

const SECTORES_BASE = [
  { id: 1, nombre: "Entrada Playa / Balanza", cuadrante: "A1", activo: true },
  { id: 2, nombre: "Calle Lateral", cuadrante: "A2", activo: true },
  { id: 3, nombre: "Galpón Viejo", cuadrante: "A3", activo: true },
  { id: 4, nombre: "Playa Logística Central", cuadrante: "B1", activo: true },
  { id: 5, nombre: "Costado Molienda", cuadrante: "B2", activo: true },
  { id: 6, nombre: "Badén Silo", cuadrante: "B3", activo: true },
  { id: 7, nombre: "Frente al Taller", cuadrante: "C1", activo: true },
  { id: 8, nombre: "Estibas Sur", cuadrante: "C2", activo: true },
  { id: 9, nombre: "Zona Conos Silo", cuadrante: "C3", activo: true }
];

const DESTINOS_BASE = [
  { id: 1, nombre: "Cajón 3 - En Producción", tipo: "produccion", activo: true, desc: "Alimentación directa a nave de producción" },
  { id: 9, nombre: "Cajón 1 - Consumo Silo", tipo: "produccion", activo: true, desc: "Consumo desde cono de silo" },
  { id: 2, nombre: "Cajón 2 - Entrada Silo", tipo: "silo", activo: true, desc: "Entrada alimentadora hacia conos de silo" },
  { id: 3, nombre: "Cono 1", tipo: "silo", activo: true, desc: "Cono de estacionamiento de tierra" },
  { id: 4, nombre: "Cono 2", tipo: "silo", activo: true, desc: "Cono de estacionamiento de tierra" },
  { id: 5, nombre: "Cono 3", tipo: "silo", activo: true, desc: "Cono de estacionamiento de tierra" },
  { id: 6, nombre: "Cono Intermedio", tipo: "silo", activo: true, desc: "Entre Cono 2 y Cono 3" },
  { id: 7, nombre: "CMP Yerba Buena", tipo: "externo", activo: true, desc: "Despacho para planta secundaria" },
  { id: 8, nombre: "Acopio Playa", tipo: "playa", activo: true, desc: "Pila de acopio en playa de logística" }
];

const ACCIONES_BASE = [
  { id: 1, nombre: "Retiro Descartes", activo: true },
  { id: 2, nombre: "Nivelación Terreno", activo: true },
  { id: 3, nombre: "Regado", activo: true },
  { id: 4, nombre: "Desbarrado", activo: true },
  { id: 5, nombre: "Limpieza", activo: true },
  { id: 6, nombre: "Raspar Barro", activo: true },
  { id: 7, nombre: "Rellenar Roturas", activo: true }
];

const CARACTERISTICAS_TIERRA_BASE = [
  { id: 1, nombre: "Humedad", activo: true },
  { id: 2, nombre: "Caliza", activo: true },
  { id: 3, nombre: "Raíces", activo: true },
  { id: 4, nombre: "Basura", activo: true },
  { id: 5, nombre: "Piedras", activo: true },
  { id: 6, nombre: "Tierra Negra", activo: true }
];

const MOTIVOS_PARADA_VALIDADOS = [
  "Frenos / Bloqueo",
  "Temperatura Alta",
  "Falla Eléctrica / Alternador",
  "Falla Hidráulica / Mangueras",
  "Motor / Inyección",
  "Pinchadura / Neumático",
  "Mantenimiento Preventivo"
];

// Vértices ortogonales enderezados para encajar en el canvas apaisado (16:9)
// basados en el relevamiento de Google Maps: 8,817.24 m² / Linde 400.00 m / Nave 100.00 m
const VERTICES_POLIGONO_CALIBRADOS = [
  { id: "v1", x: 130, y: 40, label: "Esq. Norte (Entrada Balanza)" },
  { id: "v2", x: 840, y: 40, label: "Linde Este 400 m (Cam. del Perú)" },
  { id: "v3", x: 840, y: 390, label: "Linde Sur-Este 300 m" },
  { id: "v4", x: 530, y: 450, label: "Esq. Taller y Mantenimiento" },
  { id: "v5", x: 130, y: 350, label: "Linde Nave Molienda 100 m" }
];

const SECTORES_VIRTUALES_INICIALES = [
  { id: "sec-1", nombre: "Entrada / Balanza", tipo: "acceso", x: 150, y: 60, w: 180, h: 90, color: "#38bdf8", desc: "Recepción y pesaje de camiones" },
  { id: "sec-2", nombre: "Playa Logística Central", tipo: "playa", x: 360, y: 60, w: 280, h: 180, color: "#10b981", desc: "Mezclas y acopios principales" },
  { id: "sec-3", nombre: "Costado Molienda", tipo: "playa", x: 150, y: 175, w: 180, h: 145, color: "#f59e0b", desc: "Alimentación a tolvas y triturado" },
  { id: "sec-4", nombre: "Estibas Sur (Reserva)", tipo: "playa", x: 665, y: 165, w: 155, h: 190, color: "#8b5cf6", desc: "Acopios de largo plazo" }
];
const CAJONES_INICIALES = {
  c3: { nombre: 'Cajón 3', x: 60, y: 264, w: 60, h: 42, color: '#0d9488', visible: true },
  c2: { nombre: 'Cajón 2', x: 126, y: 264, w: 60, h: 42, color: '#d97706', visible: true },
  c1: { nombre: 'Cajón 1', x: 192, y: 264, w: 66, h: 42, color: '#2563eb', visible: true }
};
const CONOS_INICIALES = {
  'cono-1': { x: 335, y: 388, r: 19 }, 'cono-2': { x: 385, y: 388, r: 19 },
  'cono-intermedio': { x: 435, y: 388, r: 16 }, 'cono-3': { x: 485, y: 388, r: 19 }
};

const App = () => {
  // Estado de Tema y Vistas
  const [darkMode, setDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentStep, setCurrentStep] = useState(1);
  const [liveDate, setLiveDate] = useState(new Date());

  // Parámetros Maestros
  const [densidadTierra, setDensidadTierra] = useState(1.50);
  const [adminPin, setAdminPin] = useState("1234");
  const [nuevoPin, setNuevoPin] = useState("");
  const [appsScriptUrl, setAppsScriptUrl] = useState(APPS_SCRIPT_URL);
  const [estadoSheet, setEstadoSheet] = useState({ estado: 'sin_conectar', etag: null, revision: null, aplicado: false });
  const [historicoSheet, setHistoricoSheet] = useState(null);
  const [historicoGid, setHistoricoGid] = useState(1381238472);
  const [historicoFuente, setHistoricoFuente] = useState('csv');
  const [historicoOffset, setHistoricoOffset] = useState(0);
  const [cargandoHistorico, setCargandoHistorico] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [datosEjemplo, setDatosEjemplo] = useState(false);
  const [conosValidados, setConosValidados] = useState(false);
  const [historialReportes, setHistorialReportes] = useState([]);
  const [stockCajon2, setStockCajon2] = useState(0);
  const [ajustesManuales, setAjustesManuales] = useState([]);
  const [ajustePropuesto, setAjustePropuesto] = useState({ tipo: 'acopio', id: '', toneladas: '', motivo: '', responsable: '' });
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [turnosValidados, setTurnosValidados] = useState(null);
  const [stockValidadoSheet, setStockValidadoSheet] = useState(null);
  const [destinatariosInforme, setDestinatariosInforme] = useState([]);
  const [nuevoDestinatario, setNuevoDestinatario] = useState({ email: '', nombre: '', area: '' });
  const [destinatariosTelegram, setDestinatariosTelegram] = useState([]);
  const [nuevoTelegram, setNuevoTelegram] = useState({ nombre: '', telefono: '', chatId: '', destino: 'Todos' });
  const [lecturasClima, setLecturasClima] = useState({ met: {}, weather: {}, accuweather: {}, weatherapi: {} });
  const [cargandoClima, setCargandoClima] = useState(false);
  const [errorClima, setErrorClima] = useState('');
  const [climaZona, setClimaZona] = useState('mejor');
  const [geoClimaEstado, setGeoClimaEstado] = useState('');
  const [legacyDisponible, setLegacyDisponible] = useState(false);
  const [migracionParcial, setMigracionParcial] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState('operarios');

  // Catálogos Maestros Configurables
  const [operadores, setOperadores] = useState(VALIDATED.operadores);
  const [maquinas, setMaquinas] = useState(VALIDATED.maquinas);
  const [canteras, setCanteras] = useState(VALIDATED.canteras);
  const [sectores, setSectores] = useState(VALIDATED.sectores);
  const [destinosGenerales, setDestinosGenerales] = useState(DESTINOS_BASE);
  const [accionesPlaya, setAccionesPlaya] = useState(VALIDATED.acciones);
  const [caracteristicasTierra, setCaracteristicasTierra] = useState(CARACTERISTICAS_TIERRA_BASE);
  const [escalaCalidad, setEscalaCalidad] = useState(3);

  // Estado del Terreno y Plano CAD Interactivo
  const [verticesPoligono, setVerticesPoligono] = useState(VERTICES_POLIGONO_CALIBRADOS);
  const [sectoresVirtuales, setSectoresVirtuales] = useState(SECTORES_VIRTUALES_INICIALES);
  const [mapInteractionMode, setMapInteractionMode] = useState('view'); // view, acopios, sectores, limites, tolvas_silos
  const [acopioSeleccionadoPlano, setAcopioSeleccionadoPlano] = useState(null);
  const [sectorSeleccionadoPlano, setSectorSeleccionadoPlano] = useState(null);
  const [objetoSeleccionadoPlano, setObjetoSeleccionadoPlano] = useState(null);
  const [draggingEntity, setDraggingEntity] = useState(null);
  const svgPlanoRef = useRef(null);

  const [posicionNaveMolienda, setPosicionNaveMolienda] = useState({ x: 50, y: 220, w: 220, h: 125 });
  const [posicionSiloConos, setPosicionSiloConos] = useState({ x: 300, y: 350, w: 230, h: 80, diametroConos: 38 });
  const [posicionCajones, setPosicionCajones] = useState(CAJONES_INICIALES);
  const [posicionConos, setPosicionConos] = useState(CONOS_INICIALES);
  const [elementosMapa, setElementosMapa] = useState([]);
  const [verticeSeleccionado, setVerticeSeleccionado] = useState(null);

  const [stockPlaya, setStockPlaya] = useState(VALIDATED.acopios);

  const [stockSilos, setStockSilos] = useState([
    { id: "cono-1", nombre: "Cono 1", toneladas: 0, paladasOperativas: 0, activo: true },
    { id: "cono-2", nombre: "Cono 2", toneladas: 0, paladasOperativas: 0, activo: true },
    { id: "cono-3", nombre: "Cono 3", toneladas: 0, paladasOperativas: 0, activo: true },
    { id: "cono-intermedio", nombre: "Cono Intermedio", toneladas: 0, paladasOperativas: 0, activo: true }
  ]);

  const [plan, setPlan] = useState({
    activa: false,
    fechaInicio: fechaLocal(),
    fechaFin: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    personal: [],
    tareasPlaya: [],
    recetasAcopio: [],
    camiones: [],
    observacionSemanal: '',
    indicacionesEstructuradas: []
  });

  const [control, setControl] = useState({
    fechaAuditada: fechaLocal(),
    asistencia: [],
    tareasAuditadas: [],
    ingresos: [],
      paladasMovimientos: [],
      transferenciasConos: [],
    paradasMaquinas: []
  });

  const [recordatorios, setRecordatorios] = useState([]);
  const [fechaPizarron, setFechaPizarron] = useState(fechaLocal());
  const [vistaPizarron, setVistaPizarron] = useState('lista');
  const [permisoAvisos, setPermisoAvisos] = useState('default');
  const [mapaDesbloqueado, setMapaDesbloqueado] = useState(false);
  const [configDesbloqueada, setConfigDesbloqueada] = useState(false);
  const [pinDestino, setPinDestino] = useState('catalogos');
  const [consultaAyuda, setConsultaAyuda] = useState('');
  const [respuestaAyuda, setRespuestaAyuda] = useState('');
  const [ayudaOcupada, setAyudaOcupada] = useState(false);
  const [comentariosMejora, setComentariosMejora] = useState([]);
  const [comentarioNuevo, setComentarioNuevo] = useState('');

  const [modalPinAbierto, setModalPinAbierto] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [modalTareaExtraAbierto, setModalTareaExtraAbierto] = useState(false);
  const [nuevaTareaExtra, setNuevaTareaExtra] = useState({ accion: "", sector: "", notas: "" });
  const [modalIngresoExtraAbierto, setModalIngresoExtraAbierto] = useState(false);
  const [nuevoIngresoExtra, setNuevoIngresoExtra] = useState({ origen: "", destino: "", volumenTon: 0, observacion: "" });
  const [modalParadaAbierto, setModalParadaAbierto] = useState(false);
  const [modalParadaData, setModalParadaData] = useState(null);
  const [modalNuevoRecordatorioAbierto, setModalNuevoRecordatorioAbierto] = useState(false);
  const [nuevoRecordatorio, setNuevoRecordatorio] = useState({ para: "Todos", texto: "", prioridad: "normal", fechaAviso: '', horaAviso: '' });

  const [toast, setToast] = useState({ visible: false, mensaje: "", tipo: "info" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);
  const [deltaPaladasInput, setDeltaPaladasInput] = useState(10);
  const [camionMapaId, setCamionMapaId] = useState(null);
  const [traspasoCono, setTraspasoCono] = useState({ origenId: '', destinoId: '' });
  const [sugerenciaIndicaciones, setSugerenciaIndicaciones] = useState(null);
  const [organizandoIndicaciones, setOrganizandoIndicaciones] = useState(false);
  const closingRef = useRef(false);
  const inicioEdicionStockRef = useRef(null);
  const dataRef = useRef({ stockPlaya, stockSilos, stockCajon2 });
  dataRef.current = { stockPlaya, stockSilos, stockCajon2 };

  useEffect(() => {
    const context = typeof document !== 'undefined' ? document.modelContext : null;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const register = tool => {
      try { Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => {}); }
      catch { /* Navegadores sin WebMCP mantienen la interfaz normal. */ }
    };
    register({ name: 'read_material_stock', title: 'Consultar stock de tierra',
      description: 'Devuelve el inventario actual de acopios, conos y Cajón 2 en toneladas.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({ acopios: dataRef.current.stockPlaya.map(a => ({ nombre: a.nombre, toneladas: a.toneladas })),
        silos: dataRef.current.stockSilos.map(s => ({ nombre: s.nombre, toneladas: s.toneladas })),
        cajon2: dataRef.current.stockCajon2 }) });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const legacy = JSON.parse(localStorage.getItem('gestion-molienda-v1') || 'null');
      if (legacy?.piles?.length) setLegacyDisponible(true);
      if (saved?.version === 2) {
        const eraDemoSinCierres = saved.datosEjemplo === true && !(saved.historialReportes?.length) &&
          (saved.stockPlaya ?? []).some(a => a.nombre === 'Acopio Mezcla Principal');
        const entries = [
          [setOperadores, saved.operadores], [setMaquinas, saved.maquinas], [setCanteras, saved.canteras],
          [setSectores, saved.sectores], [setDestinosGenerales, saved.destinosGenerales],
          [setAccionesPlaya, saved.accionesPlaya], [setCaracteristicasTierra, saved.caracteristicasTierra],
          [setVerticesPoligono, saved.verticesPoligono], [setSectoresVirtuales, saved.sectoresVirtuales],
          [setStockPlaya, saved.stockPlaya], [setStockSilos, saved.stockSilos], [setRecordatorios, saved.recordatorios]
        ];
        entries.forEach(([setter, value]) => { if (Array.isArray(value)) setter(value); });
        if (saved.plan) setPlan(saved.plan);
        if (saved.control) setControl(saved.control);
        if (saved.posicionNaveMolienda) setPosicionNaveMolienda(saved.posicionNaveMolienda);
        if (saved.posicionSiloConos) setPosicionSiloConos(saved.posicionSiloConos);
        if (saved.posicionCajones) setPosicionCajones(saved.posicionCajones);
        else if (saved.posicionNaveMolienda) setPosicionCajones(Object.fromEntries(Object.entries(CAJONES_INICIALES)
          .map(([id, c]) => [id, { ...c, x: c.x + saved.posicionNaveMolienda.x - 50,
            y: c.y + saved.posicionNaveMolienda.y - 220 }])));
        if (saved.posicionConos) setPosicionConos(saved.posicionConos);
        else if (saved.posicionSiloConos) setPosicionConos(Object.fromEntries(Object.entries(CONOS_INICIALES)
          .map(([id, c]) => [id, { ...c, x: c.x + saved.posicionSiloConos.x - 300,
            y: c.y + saved.posicionSiloConos.y - 350 }])));
        if (Array.isArray(saved.elementosMapa)) setElementosMapa(saved.elementosMapa);
        if (Array.isArray(saved.historialReportes)) setHistorialReportes(saved.historialReportes);
        if (Array.isArray(saved.ajustesManuales)) setAjustesManuales(saved.ajustesManuales);
        if (Number.isFinite(saved.densidadTierra) && saved.densidadTierra > 0) setDensidadTierra(saved.densidadTierra);
        if (Number.isFinite(saved.stockCajon2)) setStockCajon2(saved.stockCajon2);
        if (saved.lecturasClima?.zona === 'mejor') setLecturasClima({ ...saved.lecturasClima });
        if ([3, 5, 10].includes(saved.escalaCalidad)) setEscalaCalidad(saved.escalaCalidad);
        if (Array.isArray(saved.comentariosMejora)) setComentariosMejora(saved.comentariosMejora);
        if (typeof saved.datosEjemplo === 'boolean') setDatosEjemplo(saved.datosEjemplo);
        if (typeof saved.appsScriptUrl === 'string' && saved.appsScriptUrl !== 'URL_AQUI')
          setAppsScriptUrl(saved.appsScriptUrl);
        if (/^\d{4,12}$/.test(saved.adminPin ?? '')) setAdminPin(saved.adminPin);
        if (typeof saved.darkMode === 'boolean') setDarkMode(saved.darkMode);
        if (saved.migracionParcial) setMigracionParcial(true);
        if (typeof saved.conosValidados === 'boolean') setConosValidados(saved.conosValidados);
        if (eraDemoSinCierres) {
          setStockPlaya(VALIDATED.acopios);
          setStockSilos(prev => prev.map(s => ({ ...s, toneladas: 0 })));
          setOperadores(VALIDATED.operadores); setMaquinas(VALIDATED.maquinas);
          setCanteras(VALIDATED.canteras); setSectores(VALIDATED.sectores);
          setAccionesPlaya(VALIDATED.acciones);
          setPlan(prev => ({ ...prev, activa: false, personal: [], tareasPlaya: [], recetasAcopio: [], camiones: [] }));
          setRecordatorios([]); setDatosEjemplo(false); setConosValidados(false);
        }
      } else if (legacy?.piles?.length &&
          (legacy.demo === false || legacy.history?.length || legacy.audits?.length || legacy.plan?.length)) {
        const px = x => Math.round(numero(x) * 940 / 960);
        const py = y => Math.round(numero(y) * 480 / 590);
        setStockPlaya(legacy.piles.map(a => ({ id: a.id, nombre: a.name, sector: 'Playa',
          posX: px(a.x), posY: py(a.y), radioBase: a.r, largoEje: a.r,
          pisos: a.floors, toneladas: numero(a.tons), m3Estimados: redondear(numero(a.tons) / numero(legacy.density || 1.5)),
          paladas: Math.round(numero(a.tons) / (numero(legacy.density || 1.5) * numero(legacy.bucket || 3))),
          origenReceta: a.recipe ?? '', textura: { arcilla: 60, arena: 20, limo: 20 },
          calidades: { Humedad: 0, Caliza: 0, Raíces: 0, Basura: 0, Piedras: 0, 'Tierra Negra': 0 }, activo: true })));
        if (legacy.silos) setStockSilos(Object.entries(legacy.silos).map(([nombre, toneladas]) =>
          ({ id: nombre, nombre, toneladas: numero(toneladas), activo: true })));
        setStockCajon2(numero(legacy.cajon2));
        if (Array.isArray(legacy.people) && legacy.people.length) setOperadores(legacy.people.map(p =>
          ({ id: p.id, nombre: p.name, activo: p.active, puestosHabilitados: p.roles ?? [] })));
        if (Array.isArray(legacy.machines) && legacy.machines.length) setMaquinas(legacy.machines.map(m =>
          ({ id: m.id, nombre: m.name, activo: m.active, m3PorPalada: m.bucket })));
        if (Array.isArray(legacy.sources) && legacy.sources.length) setCanteras(legacy.sources.map(c =>
          ({ id: c.id, nombre: c.name, tipo: c.type, activo: c.active })));
        if (Array.isArray(legacy.sectors) && legacy.sectors.length) setSectoresVirtuales(legacy.sectors.map(s =>
          ({ id: s.id, nombre: s.name, tipo: 'playa', x: px(s.x), y: py(s.y),
            w: px(s.w), h: py(s.h), color: '#10b981', desc: '' })));
        if (Array.isArray(legacy.boundary) && legacy.boundary.length >= 3) setVerticesPoligono(legacy.boundary.map((v, i) =>
          ({ id: `v${i}`, x: px(v.x), y: py(v.y), label: `Vértice ${i + 1}` })));
        if (Array.isArray(legacy.actions) && legacy.actions.length) setAccionesPlaya(legacy.actions.map((a, i) =>
          ({ id: `a${i}`, nombre: a, activo: true })));
        if (Array.isArray(legacy.audits)) setHistorialReportes(legacy.audits.filter(a => a.closed).map(a =>
          ({ id: a.id, fecha: a.date, auditadoPor: 'Versión anterior',
            totalToneladasIngresadas: numero(a.record?.incoming), totalM3Movidos: numero(a.record?.moved) / numero(legacy.density || 1.5),
            totalPaladas: (a.moves ?? []).reduce((n, m) => n + numero(m.loads), 0), totalMinutosParada: 0,
            cumplimientoTareasPct: 0, sincronizacion: 'anterior', controlData: a })));
        if (numero(legacy.density) > 0) setDensidadTierra(numero(legacy.density));
        setDatosEjemplo(legacy.demo !== false);
        setMigracionParcial(true);
      }
    } catch (error) { console.warn('No se pudo recuperar el estado local:', error); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot = {
      version: 2, operadores, maquinas, canteras, sectores, destinosGenerales, accionesPlaya,
      caracteristicasTierra, escalaCalidad, comentariosMejora, verticesPoligono, sectoresVirtuales, posicionNaveMolienda,
      posicionSiloConos, posicionCajones, posicionConos, elementosMapa,
      stockPlaya, stockSilos, stockCajon2, plan, control, recordatorios,
      historialReportes, ajustesManuales, densidadTierra, datosEjemplo, conosValidados, lecturasClima, appsScriptUrl, adminPin,
      migracionParcial, darkMode
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); }
    catch { setToast({ visible: true, mensaje: 'Almacenamiento lleno. Exportá un respaldo desde Configuración.', tipo: 'error' }); }
  }, [hydrated, operadores, maquinas, canteras, sectores, destinosGenerales, accionesPlaya,
    caracteristicasTierra, escalaCalidad, comentariosMejora, verticesPoligono, sectoresVirtuales, posicionNaveMolienda,
    posicionSiloConos, posicionCajones, posicionConos, elementosMapa,
    stockPlaya, stockSilos, stockCajon2, plan, control, recordatorios,
    historialReportes, ajustesManuales, densidadTierra, datosEjemplo, conosValidados, lecturasClima, appsScriptUrl, adminPin,
    migracionParcial, darkMode]);

  useEffect(() => {
    const timer = setInterval(() => setLiveDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPermisoAvisos(Notification.permission);
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const ahora = Date.now();
      const pendientes = recordatorios.filter(r => r.fechaAviso && r.horaAviso && !r.completado && !r.notificadoEn &&
        (() => { const fecha = new Date(`${r.fechaAviso}T${r.horaAviso}:00-03:00`).getTime();
          return Number.isFinite(fecha) && fecha <= ahora && ahora - fecha <= 5 * 60_000; })());
      if (!pendientes.length) return;
      pendientes.forEach(r => new Notification('Gestión Molienda · aviso', { body: r.texto.slice(0, 160), tag: `molienda-${r.id}` }));
      const ids = new Set(pendientes.map(r => r.id));
      setRecordatorios(prev => prev.map(r => ids.has(r.id) ? { ...r, notificadoEn: new Date().toISOString() } : r));
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [recordatorios]);

  useEffect(() => {
    if (!hydrated || (currentView !== 'clima' && currentView !== 'dashboard')) return;
    const controller = new AbortController();
    const cargar = async () => {
      setCargandoClima(true); setErrorClima('');
      try {
        const response = await fetch(`/api/weather?zona=${climaZona}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('No se pudo consultar el pronóstico actual.');
        const result = await response.json();
        if (result.met?.estado !== 'actualizado' || !result.met.dias?.length) throw new Error('No hay un pronóstico actual disponible.');
        if (!controller.signal.aborted) setLecturasClima(result);
      } catch (error) { if (error.name !== 'AbortError') setErrorClima(error.message); }
      finally { if (!controller.signal.aborted) setCargandoClima(false); }
    };
    cargar();
    const timer = setInterval(cargar, 30 * 60 * 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [currentView, climaZona, hydrated]);

  useEffect(() => {
    if (!hydrated || !appsScriptUrl || appsScriptUrl === 'URL_AQUI') return;
    cargarEstadoSheet();
  }, [hydrated, appsScriptUrl]);

  const consultarAppsScript = async (action, extra = {}) => {
    const response = await fetch('/api/sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: appsScriptUrl, action, ...extra }) });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch { throw new Error('El servidor devolvió una página HTML en lugar de datos. Revisá el despliegue del sitio y actualizá la implementación de Apps Script con Code.gs; luego volvé a consultar.'); }
    if (!response.ok || result.ok !== true) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  };

  const organizarIndicaciones = async () => {
    setOrganizandoIndicaciones(true);
    try {
      const response = await fetch('/api/organize-note', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: plan.observacionSemanal }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo procesar el texto.');
      setSugerenciaIndicaciones(data);
    } catch (error) { showToast(error.message, 'error'); }
    finally { setOrganizandoIndicaciones(false); }
  };

  const cargarEstadoSheet = async () => {
    if (!appsScriptUrl || appsScriptUrl === 'URL_AQUI') return;
    try {
      const remoto = await consultarAppsScript('state');
      if (remoto.catalogos) {
        const enabled = row => String(row.estado).toUpperCase() !== 'INACTIVO';
        if (remoto.catalogos.operadores?.length) setOperadores(remoto.catalogos.operadores.map(x => ({ id: x.id, nombre: x.nombre,
          puestosHabilitados: String(x.puestosHabilitados ?? '').split(',').map(s => s.trim()).filter(Boolean), activo: enabled(x) })));
        if (remoto.catalogos.maquinas?.length) setMaquinas(remoto.catalogos.maquinas.map(x => ({ id: x.id, nombre: x.nombre,
          m3PorPalada: numero(x.m3PorPalada), activo: enabled(x) })));
        if (remoto.catalogos.canteras?.length) setCanteras(remoto.catalogos.canteras.map(x => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, activo: enabled(x) })));
        if (remoto.catalogos.sectores?.length) setSectores(remoto.catalogos.sectores.map(x => ({ id: x.id, nombre: x.nombre,
          cuadrante: x.cuadrante, activo: enabled(x) })));
        if (remoto.catalogos.acciones?.length) setAccionesPlaya(remoto.catalogos.acciones.map(x => ({ id: x.id, nombre: x.nombre, activo: enabled(x) })));
      }
      setTurnosValidados(remoto.cantidadTurnos ?? null);
      setStockValidadoSheet(remoto.stock ?? null);
      if (Array.isArray(remoto.destinatarios)) setDestinatariosInforme(remoto.destinatarios);
      if (Array.isArray(remoto.telegramDestinatarios)) setDestinatariosTelegram(remoto.telegramDestinatarios);
      if (Array.isArray(remoto.recordatorios)) setRecordatorios(prev => {
        const map = new Map(prev.map(r => [String(r.id), r]));
        remoto.recordatorios.forEach(r => map.set(String(r.id), { ...map.get(String(r.id)), ...r, sincronizado: true }));
        return [...map.values()];
      });
      if (Array.isArray(remoto.informes)) {
        const byId = new Map(remoto.informes.map(x => [x.id, x]));
        setHistorialReportes(prev => prev.map(x => byId.has(String(x.id)) ? { ...x, informe: byId.get(String(x.id)) } : x));
      }
      if (remoto.ajustesRecientes?.length) setAjustesManuales(prev => {
        const ids = new Set(prev.map(a => a.id));
        return [...remoto.ajustesRecientes.filter(a => !ids.has(a.idAjuste)).map(a => ({ ...a,
          id: a.idAjuste, origen: 'Google Sheets' })), ...prev];
      });
      const idsRemotos = new Set(remoto.reports?.map(r => String(r.id)) ?? []);
      const sinEnviar = historialReportes.filter(r => r.sincronizacion === 'pendiente' && !idsRemotos.has(String(r.id)));
      if (idsRemotos.size) setHistorialReportes(prev => prev.map(r => idsRemotos.has(String(r.id))
        ? { ...r, sincronizacion: 'confirmada' } : r));
      const pendientes = sinEnviar.length > 0;
      const primero = [...sinEnviar].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const permiteReintento = pendientes && inventariosEquivalentes(remoto.stock, primero?.stockPreCierre);
      const aplicar = !!remoto.stock && !pendientes;
      setEstadoSheet({ estado: 'conectado', revision: remoto.revision, etag: remoto.etag,
        aplicado: aplicar || !remoto.stock || permiteReintento, actualizado: new Date().toISOString(),
        pendientes, mensaje: aplicar ? 'Acopios y catálogos validados cargados desde la planilla.' :
          pendientes ? permiteReintento ? 'Saldo previo coincide: se puede reintentar el cierre pendiente.' :
            'Hay cierres locales pendientes y el saldo remoto difiere. Conciliá antes de reintentar.' :
            'Todavía no se pudo leer un saldo validado.' });
      if (aplicar) {
        setStockPlaya(prev => {
          const actualizados = prev.map(a => { const r = remoto.stock.acopios.find(x => clave(x.nombre) === clave(a.nombre) || String(x.id) === String(a.id));
            return r ? { ...a, nombre: r.nombre, sector: r.sector ?? a.sector, cuadrante: r.cuadrante ?? a.cuadrante,
              pisos: r.pisos ?? a.pisos, activo: r.activo ?? a.activo, toneladas: numero(r.toneladas),
              m3Estimados: numero(r.m3Estimados) || redondear(numero(r.toneladas) / densidadTierra) } : a; });
          const faltantes = remoto.stock.acopios.filter(r => !prev.some(a => clave(a.nombre) === clave(r.nombre) || String(a.id) === String(r.id)));
          return [...actualizados, ...faltantes.map((r, i) => ({ id: r.id, nombre: r.nombre, toneladas: numero(r.toneladas),
            posX: 450 + i * 45, posY: 160 + i * 25, radioBase: 30, largoEje: 40, pisos: 1, paladas: 0,
            m3Estimados: numero(r.m3Estimados) || redondear(numero(r.toneladas) / densidadTierra),
            calidades: {}, textura: { arcilla: 0, arena: 0, limo: 0 }, activo: r.activo ?? true }))];
        });
        setStockSilos(prev => [...prev.map(s => { const r = remoto.stock.conos.find(x => clave(x.nombre) === clave(s.nombre) || String(x.id) === String(s.id));
          return r ? { ...s, toneladas: numero(r.toneladas), humedadNivel: nivelHumedad(r.humedadNivel), paladasOperativas: numero(r.paladasOperativas) } : s; }),
          ...remoto.stock.conos.filter(r => !prev.some(s => clave(s.nombre) === clave(r.nombre) || String(s.id) === String(r.id)))
            .map(r => ({ id: r.id, nombre: r.nombre, toneladas: numero(r.toneladas), humedadNivel: nivelHumedad(r.humedadNivel), paladasOperativas: numero(r.paladasOperativas), activo: true }))]);
        setPosicionConos(prev => {
          const nuevos = remoto.stock.conos.filter(r => !prev[r.id]);
          return Object.fromEntries([...Object.entries(prev), ...nuevos.map((r, i) =>
            [r.id, { x: 335 + (Object.keys(prev).length + i) * 50, y: 388, r: 19 }])]);
        });
        setStockCajon2(numero(remoto.stock.cajon2));
        setConosValidados(!!remoto.conosValidados);
        setDatosEjemplo(false);
      }
    } catch (error) { setEstadoSheet(prev => ({ ...prev, estado: 'error', mensaje: error.message })); }
  };

  useEffect(() => {
    if (currentView !== 'historico') return;
    let activo = true;
    setCargandoHistorico(true);
    const origen = historicoFuente === 'sheets' && appsScriptUrl && appsScriptUrl !== 'URL_AQUI'
      ? consultarAppsScript('historical', { gid: historicoGid, offset: historicoOffset })
      : fetch(`/api/history?offset=${historicoOffset}`).then(async response => {
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || 'Histórico no disponible');
          return data;
        });
    origen.then(data => { if (activo) setHistoricoSheet(data); })
      .catch(error => { if (activo) setHistoricoSheet({ error: error.message, tabs: [], filas: [] }); })
      .finally(() => { if (activo) setCargandoHistorico(false); });
    return () => { activo = false; };
  }, [currentView, historicoGid, historicoOffset, appsScriptUrl, historicoFuente]);

  const showToast = (mensaje, tipo = "info") => {
    setToast({ visible: true, mensaje, tipo });
    setTimeout(() => setToast({ visible: false, mensaje: "", tipo: "info" }), 3500);
  };

  const densidadAcopio = acopio => densidadPorHumedad(densidadTierra, acopio?.calidades?.Humedad ?? 1);
  const calcularM3aTon = (m3, acopio) => redondear(numero(m3) * densidadAcopio(acopio));
  const calcularTonaM3 = (ton, acopio) => redondear(numero(ton) / Math.max(0.01, densidadAcopio(acopio)));

  const getDiasVencidos = () => {
    if (!plan.activa) return [];
    const dates = [];
    const curr = new Date(plan.fechaInicio + 'T00:00:00');
    const end = new Date(plan.fechaFin + 'T00:00:00');
    const yesterday = new Date(fechaLocal() + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const limite = yesterday < end ? yesterday : end;

    while (curr <= limite && dates.length < 366) {
      dates.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`);
      curr.setDate(curr.getDate() + 1);
    }
    return dates.reverse().filter(d => !historialReportes.some(r => r.fecha === d));
  };

  const stringPuntosPoligono = verticesPoligono.map(v => `${v.x},${v.y}`).join(' ');

  const getSvgCoordinates = (e) => {
    if (!svgPlanoRef.current) return { x: 0, y: 0 };
    const svg = svgPlanoRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    pt.y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const cursorPt = pt.matrixTransform(matrix.inverse());
    return { x: Math.round(cursorPt.x), y: Math.round(cursorPt.y) };
  };

  const handleSvgMouseDown = (e) => {
    if (e.target.tagName === 'rect' && e.target.getAttribute('fill')?.includes('gridCAD')) {
      setAcopioSeleccionadoPlano(null);
      setSectorSeleccionadoPlano(null);
    }
  };

  const handleSvgMouseMove = (e) => {
    if (currentView !== 'editorPlano' || !mapaDesbloqueado) return;
    if (!draggingEntity) return;
    const coords = getSvgCoordinates(e);

    if (draggingEntity.type === 'vertice') {
      setVerticesPoligono(prev => prev.map(v => v.id === draggingEntity.id ? { ...v, x: Math.max(0, Math.min(940, coords.x)), y: Math.max(0, Math.min(480, coords.y)) } : v));
    } else if (draggingEntity.type === 'acopio') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setStockPlaya(prev => prev.map(a => a.id === draggingEntity.id ? {
        ...a, posX: Math.max(20, Math.min(920, draggingEntity.initialX + dx)),
        posY: Math.max(20, Math.min(460, draggingEntity.initialY + dy))
      } : a));
    } else if (draggingEntity.type === 'acopio_resize') {
      setStockPlaya(prev => prev.map(a => a.id === draggingEntity.id ? {
        ...a, [draggingEntity.axis]: Math.max(12, Math.min(125,
          draggingEntity.axis === 'largoEje' ? coords.x - a.posX : (a.posY - coords.y) / 0.72))
      } : a));
    } else if (draggingEntity.type === 'sector') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setSectoresVirtuales(prev => prev.map(s => s.id === draggingEntity.id ? {
        ...s,
        x: Math.max(20, draggingEntity.initialX + dx),
        y: Math.max(20, draggingEntity.initialY + dy)
      } : s));
    } else if (draggingEntity.type === 'sector_resize') {
      const newW = Math.max(80, coords.x - draggingEntity.sectorX);
      const newH = Math.max(60, coords.y - draggingEntity.sectorY);
      setSectoresVirtuales(prev => prev.map(s => s.id === draggingEntity.id ? { ...s, w: newW, h: newH } : s));
    } else if (draggingEntity.type === 'nave_molienda') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setPosicionNaveMolienda(prev => ({ ...prev, x: Math.max(0, draggingEntity.initialX + dx),
        y: Math.max(0, draggingEntity.initialY + dy) }));
    } else if (draggingEntity.type === 'silo_conos') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setPosicionSiloConos(prev => ({ ...prev, x: Math.max(0, draggingEntity.initialX + dx),
        y: Math.max(0, draggingEntity.initialY + dy) }));
    } else if (draggingEntity.type === 'cajon') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setPosicionCajones(prev => ({ ...prev, [draggingEntity.id]: { ...prev[draggingEntity.id],
        x: Math.max(0, draggingEntity.initialX + dx), y: Math.max(0, draggingEntity.initialY + dy) } }));
    } else if (draggingEntity.type === 'cono') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setPosicionConos(prev => ({ ...prev, [draggingEntity.id]: { ...prev[draggingEntity.id],
        x: Math.max(0, draggingEntity.initialX + dx), y: Math.max(0, draggingEntity.initialY + dy) } }));
    } else if (draggingEntity.type === 'elemento') {
      const dx = coords.x - draggingEntity.startCoords.x;
      const dy = coords.y - draggingEntity.startCoords.y;
      setElementosMapa(prev => prev.map(a => a.id === draggingEntity.id ? { ...a,
        x: Math.max(0, draggingEntity.initialX + dx), y: Math.max(0, draggingEntity.initialY + dy) } : a));
    } else if (draggingEntity.type === 'cajon_resize') {
      setPosicionCajones(prev => ({ ...prev, [draggingEntity.id]: { ...prev[draggingEntity.id],
        w: Math.max(35, coords.x - prev[draggingEntity.id].x),
        h: Math.max(28, coords.y - prev[draggingEntity.id].y) } }));
    } else if (draggingEntity.type === 'cono_resize') {
      setPosicionConos(prev => ({ ...prev, [draggingEntity.id]: { ...prev[draggingEntity.id],
        r: Math.max(12, Math.min(60, Math.hypot(coords.x - prev[draggingEntity.id].x,
          coords.y - prev[draggingEntity.id].y))) } }));
    } else if (draggingEntity.type === 'elemento_resize') {
      setElementosMapa(prev => prev.map(a => a.id === draggingEntity.id ? { ...a,
        w: Math.max(25, coords.x - a.x), h: Math.max(25, coords.y - a.y) } : a));
    } else if (draggingEntity.type === 'nave_resize') {
      setPosicionNaveMolienda(prev => ({ ...prev, w: Math.max(110, coords.x - prev.x),
        h: Math.max(70, coords.y - prev.y) }));
    } else if (draggingEntity.type === 'silo_resize') {
      setPosicionSiloConos(prev => ({ ...prev, w: Math.max(140, coords.x - prev.x),
        h: Math.max(60, coords.y - prev.y) }));
    }
  };

  const handleSvgMouseUp = () => {
    setDraggingEntity(null);
  };

  useEffect(() => {
    setAcopioSeleccionadoPlano(prev => prev ? stockPlaya.find(a => a.id === prev.id) ?? null : null);
  }, [stockPlaya]);

  useEffect(() => {
    setSectorSeleccionadoPlano(prev => prev ? sectoresVirtuales.find(s => s.id === prev.id) ?? null : null);
  }, [sectoresVirtuales]);

  const agregarVerticePoligono = () => {
    const nuevoVerticeId = nuevoId();
    const ultimo = verticesPoligono[verticesPoligono.length - 1] || { x: 300, y: 300 };
    const nuevoVertice = {
      id: nuevoVerticeId,
      x: Math.min(900, ultimo.x + 30),
      y: Math.min(450, ultimo.y + 30),
      label: `Vértice ${verticesPoligono.length + 1}`
    };
    setVerticesPoligono(prev => [...prev, nuevoVertice]);
    setMapInteractionMode('limites');
    showToast("Vértice añadido al polígono perimetral.");
  };

  const acopioDesdeReceta = receta => {
    const sectorDest = sectoresVirtuales.find(s => s.nombre === receta.sectorDestino) || sectoresVirtuales[1] || { x: 400, y: 150 };
    return {
      id: nuevoId(), recetaId: receta.id,
      nombre: receta.nombreNuevoAcopio,
      sector: receta.sectorDestino || "Playa Logística Central",
      posX: sectorDest.x + 55,
      posY: sectorDest.y + 50,
      radioBase: 34,
      largoEje: 44,
      pisos: receta.pisosPrevistos || 1,
      paladas: 0,
      toneladas: 0,
      m3Estimados: 0,
      origenReceta: `${receta.paladas1} pal. de ${receta.componente1} + ${receta.paladas2} pal. de ${receta.componente2}`,
      textura: { arcilla: 60, arena: 20, limo: 20 },
      calidades: { Humedad: 1, Caliza: 1, Raíces: 0, Basura: 0, Piedras: 0, "Tierra Negra": 0 },
      activo: true,
      esFuturo: true
    };
  };

  const materializarAcopiosPlanificados = () => {
    setStockPlaya(prev => {
      const nuevos = plan.recetasAcopio.filter(rec => rec.nombreNuevoAcopio.trim() &&
        !prev.some(a => a.recetaId === rec.id || clave(a.nombre) === clave(rec.nombreNuevoAcopio)));
      return [...prev, ...nuevos.map(acopioDesdeReceta)];
    });
  };

  const ubicarAcopioFuturoEnPlano = (receta) => {
    const existente = stockPlaya.find(a => a.recetaId === receta.id || clave(a.nombre) === clave(receta.nombreNuevoAcopio));
    if (existente) {
      setAcopioSeleccionadoPlano(existente); setMapInteractionMode('acopios');
      return;
    }
    const nuevoAcopio = acopioDesdeReceta(receta);

    setStockPlaya(prev => [...prev, nuevoAcopio]);
    setAcopioSeleccionadoPlano(nuevoAcopio);
    setMapInteractionMode('acopios');
    showToast(`Acopio "${receta.nombreNuevoAcopio}" colocado en el plano.`);
  };

  const actualizarCalidadAcopio = (acopioId, nombreCaract, puntaje) => {
    setStockPlaya(prev => prev.map(a => {
      if (a.id === acopioId) {
        const calidadesActuales = a.calidades || {};
        const updated = {
          ...a,
          calidades: { ...calidadesActuales, [nombreCaract]: puntaje },
          m3Estimados: nombreCaract === 'Humedad'
            ? redondear(numero(a.toneladas) / densidadPorHumedad(densidadTierra, puntaje)) : a.m3Estimados
        };
        if (acopioSeleccionadoPlano?.id === acopioId) {
          setAcopioSeleccionadoPlano(updated);
        }
        return updated;
      }
      return a;
    }));
  };

  const actualizarTexturaAcopio = (acopioId, tipoComponente, valor) => {
    setStockPlaya(prev => prev.map(a => {
      if (a.id === acopioId) {
        const tex = normalizarTextura(a.textura || { arcilla: 60, arena: 20, limo: 20 }, tipoComponente, valor);
        const updated = { ...a, textura: tex };
        if (acopioSeleccionadoPlano?.id === acopioId) {
          setAcopioSeleccionadoPlano(updated);
        }
        return updated;
      }
      return a;
    }));
  };

  const modificarPisosEnAcopioPlano = (acopioId, nivel) => {
    setStockPlaya(prev => prev.map(a => {
      if (a.id === acopioId) {
        const updated = { ...a, pisos: nivel };
        if (acopioSeleccionadoPlano?.id === acopioId) {
          setAcopioSeleccionadoPlano(updated);
        }
        return updated;
      }
      return a;
    }));
  };

  const registrarAjusteManual = (nombre, antesTon, despuesTon, metodo) => {
    if (redondear(antesTon) === redondear(despuesTon)) return;
    setAjustesManuales(prev => [{ id: nuevoId(), fecha: new Date().toISOString(),
      nombre, antesTon: redondear(antesTon), despuesTon: redondear(despuesTon), metodo }, ...prev]);
  };

  const finalizarEdicionStock = () => {
    const inicio = inicioEdicionStockRef.current;
    inicioEdicionStockRef.current = null;
    if (!inicio) return;
    const actual = dataRef.current.stockPlaya.find(a => a.id === inicio.id);
    if (actual) registrarAjusteManual(actual.nombre, inicio.toneladas, actual.toneladas, inicio.metodo);
  };

  const aplicarDeltaManual = (signo) => {
    if (!acopioSeleccionadoPlano) return;
    const delta = Math.round(Math.abs(Number(deltaPaladasInput) || 0)) * signo;
    if (!delta) return;
    const nuevasPaladas = Math.max(0, (acopioSeleccionadoPlano.paladas || 0) + delta);
    const m3 = nuevasPaladas * 3.0;
    const ton = calcularM3aTon(m3, acopioSeleccionadoPlano);

    setStockPlaya(prev => prev.map(a => {
      if (a.id === acopioSeleccionadoPlano.id) {
        const updated = { ...a, paladas: nuevasPaladas, m3Estimados: m3, toneladas: ton };
        setAcopioSeleccionadoPlano(updated);
        return updated;
      }
      return a;
    }));
    registrarAjusteManual(acopioSeleccionadoPlano.nombre, numero(acopioSeleccionadoPlano.toneladas), ton,
      delta > 0 ? 'Suma manual de paladas' : 'Resta manual de paladas');
    showToast(`Stock de "${acopioSeleccionadoPlano.nombre}" actualizado.`);
  };

  const iniciarControl = (fecha) => {
    const cerrado = historialReportes.find(r => r.fecha === fecha);
    if (cerrado) {
      setReporteSeleccionado(cerrado);
      setCurrentView('reportView');
      showToast('Esta jornada ya fue cerrada. Se muestra el certificado.');
      return;
    }
    if (control.fechaAuditada === fecha && control.iniciada) {
      setCurrentView('control');
      setCurrentStep(1);
      return;
    }
    materializarAcopiosPlanificados();
    const asistenciaBase = plan.personal.map(p => ({
      ...p,
      rolPlanificado: p.rol,
      rolReal: p.rol,
      maquinaPlanificada: p.maquina,
      maquinaReal: p.maquina,
      estado: 'cumplio',
      inicioReal: p.inicio,
      finReal: p.fin,
      observacion: ''
    }));

    const tareasBase = plan.tareasPlaya.map(t => ({
      ...t,
      realizadaEnTurno: null,
      mostrarFotos: false,
      fotoInicio: null,
      fotoFin: null,
      observacion: '',
      esNoPlanificada: false
    }));

    const ingresosBase = plan.camiones.map(c => ({
      ...c,
      ingresaronViajes: null,
      volumenRealTon: 0,
      calidadesEvaluadas: null,
      observacion: '',
      esNoPlanificado: false
    }));

    const paladasBase = [];

    setControl({
      fechaAuditada: fecha,
      iniciada: true,
      asistencia: asistenciaBase,
      tareasAuditadas: tareasBase,
      ingresos: ingresosBase,
      paladasMovimientos: paladasBase,
      transferenciasConos: [],
      paradasMaquinas: []
    });

    setCurrentView('control');
    setCurrentStep(1);
  };

  const handleEstadoAsistencia = (id, nuevoEstado) => {
    setControl(prev => ({
      ...prev,
      asistencia: prev.asistencia.map(p => {
        if (p.id === id) {
          let ini = p.inicio;
          let fin = p.fin;
          if (nuevoEstado === 'ausente') {
            ini = '';
            fin = '';
          }
          return { ...p, estado: nuevoEstado, inicioReal: ini, finReal: fin };
        }
        return p;
      })
    }));
  };

  const handleCambioPuestoReal = (id, nuevoRol) => {
    setControl(prev => ({
      ...prev,
      asistencia: prev.asistencia.map(p => {
        if (p.id === id) {
          const maquinaAsignada = nuevoRol === "Maquinista" ? (p.maquinaReal || maquinas[0]?.nombre || "") : "";
          return { ...p, rolReal: nuevoRol, maquinaReal: maquinaAsignada };
        }
        return p;
      })
    }));
  };

  const handleCambioMaquinaReal = (id, nuevaMaquina) => {
    setControl(prev => ({
      ...prev,
      asistencia: prev.asistencia.map(p => p.id === id ? { ...p, maquinaReal: nuevaMaquina } : p)
    }));
  };

  const handleToggleIngresoViajes = (id, llego) => {
    setControl(prev => ({
      ...prev,
      ingresos: prev.ingresos.map(ing => {
        if (ing.id === id) {
          return {
            ...ing,
            ingresaronViajes: llego,
            volumenRealTon: llego ? numero(ing.volumenRealTon) : 0,
            calidadesEvaluadas: llego
              ? (ing.calidadesEvaluadas ?? { Humedad: 0, Caliza: 0, Raíces: 0, Basura: 0, Piedras: 0, "Tierra Negra": 0 })
              : null
          };
        }
        return ing;
      })
    }));
  };

  const handleCambiarCalidadPuntaje = (ingId, nombreCaract, puntaje) => {
    setControl(prev => ({
      ...prev,
      ingresos: prev.ingresos.map(ing => {
        if (ing.id === ingId) {
          return {
            ...ing,
            calidadesEvaluadas: {
              ...(ing.calidadesEvaluadas || {}),
              [nombreCaract]: puntaje
            }
          };
        }
        return ing;
      })
    }));
  };

  const agregarMovimientoPaladas = () => {
    const maquinista = control.asistencia.find(a => a.rolReal === "Maquinista" && a.estado !== 'ausente');
    const nuevoMov = {
      id: nuevoId(),
      maquinista: maquinista?.operario ?? '',
      maquina: maquinista?.maquinaReal ?? maquinas.find(m => m.activo)?.nombre ?? '',
      origen: stockPlaya.find(a => a.activo)?.nombre ?? '',
      destino: "Cajón 3 - En Producción",
      cantPaladas: 0,
      m3Estimados: 0,
      toneladasEstimadas: 0,
      observaciones: ""
    };
    setControl(prev => ({ ...prev, paladasMovimientos: [...prev.paladasMovimientos, nuevoMov] }));
  };

  const actualizarMovimientoPaladas = (id, campo, valor) => {
    setControl(prev => ({
      ...prev,
      paladasMovimientos: prev.paladasMovimientos.map(mov => {
        if (mov.id === id) {
          const updated = { ...mov, [campo]: valor };
          if (campo === 'cantPaladas' || campo === 'maquina') {
            const pal = Math.max(0, Math.floor(numero(updated.cantPaladas)));
            const balde = numero(maquinas.find(m => m.nombre === updated.maquina)?.m3PorPalada ?? 3);
            const m3 = redondear(pal * balde);
            updated.cantPaladas = pal;
            updated.m3Estimados = m3;
            const origen = stockPlaya.find(a => clave(a.nombre) === clave(updated.origen)) ??
              stockSilos.find(s => clave(s.nombre) === clave(updated.origen));
            updated.toneladasEstimadas = calcularM3aTon(m3, origen?.calidades ? origen :
              { calidades: { Humedad: origen?.humedadNivel ?? 1 } });
          }
          if (campo === 'origen') {
            // Regla de Negocio: Si el origen es del Silo, SOLO puede ir a Producción (Cajón 3) o CMP Yerba Buena
            const esDeSilo = stockSilos.some(s => clave(s.nombre) === clave(valor));
            if (esDeSilo) {
              updated.destino = "Cajón 3 - En Producción";
            }
            if (!esDeSilo && !getDestinosFiltradosPorOrigen(valor).some(d => clave(d.nombre) === clave(updated.destino)))
              updated.destino = stockSilos.find(s => s.activo)?.nombre ?? 'Cajón 2 - Entrada Silo';
            const origen = stockPlaya.find(a => clave(a.nombre) === clave(valor)) ??
              stockSilos.find(s => clave(s.nombre) === clave(valor));
            updated.toneladasEstimadas = calcularM3aTon(numero(updated.m3Estimados), origen?.calidades ? origen :
              { calidades: { Humedad: origen?.humedadNivel ?? 1 } });
          }
          return updated;
        }
        return mov;
      })
    }));
  };

  const getDestinosFiltradosPorOrigen = (origenNombre) => {
    const esDeSilo = stockSilos.some(s => s.activo && clave(s.nombre) === clave(origenNombre));
    if (esDeSilo) {
      const destinos = destinosGenerales.filter(d => d.activo && (esCajon1(d.nombre) || esCajon3(d.nombre) || d.nombre.includes('Yerba Buena')));
      return destinos.some(d => esCajon1(d.nombre)) ? destinos : [...destinos, DESTINOS_BASE.find(d => esCajon1(d.nombre))];
    }
    return destinosGenerales.filter(d => d.activo &&
      (d.tipo === 'silo' || esCajon3(d.nombre)) && d.nombre !== 'Acopio Playa' &&
      (!stockSilos.some(s => clave(s.nombre) === clave(d.nombre)) || stockSilos.some(s => s.activo && clave(s.nombre) === clave(d.nombre))));
  };

  const calcularMinutosParada = (inicio, fin, continua) => {
    if (continua || !inicio || !fin) return 0;
    const [h1, m1] = inicio.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);
    const t1 = h1 * 60 + m1;
    const t2 = h2 * 60 + m2;
    return (t2 - t1 + 1440) % 1440;
  };

  const guardarParadaModal = () => {
    if (!modalParadaData) return;
    if (!modalParadaData.horaInicio || (!modalParadaData.continuaParada && !modalParadaData.horaFin)) {
      showToast('Completá hora de inicio y fin, o indicá que continúa parada.', 'error');
      return;
    }
    const min = calcularMinutosParada(modalParadaData.horaInicio, modalParadaData.horaFin, modalParadaData.continuaParada);
    const nueva = {
      ...modalParadaData,
      id: nuevoId(),
      minutosParados: min
    };
    setControl(prev => ({ ...prev, paradasMaquinas: [...prev.paradasMaquinas, nueva] }));
    setModalParadaAbierto(false);
    setModalParadaData(null);
    showToast("Parada de pala registrada exitosamente.");
  };

  const handleMediaUpload = (tareaId, tipoFoto, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
      showToast('Elegí una imagen de hasta 12 MB.', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const escala = Math.min(1, 1400 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * escala);
      canvas.height = Math.round(image.height * escala);
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const foto = canvas.toDataURL('image/jpeg', 0.66);
      if (foto.length > 1200000) {
        showToast('La imagen comprimida es demasiado grande.', 'error');
        return;
      }
      setControl(prev => ({
        ...prev,
        tareasAuditadas: prev.tareasAuditadas.map(t => t.id === tareaId ? { ...t, [tipoFoto]: foto } : t)
      }));
      showToast("Registro fotográfico cargado.");
    };
    image.onerror = () => { URL.revokeObjectURL(url); showToast('No se pudo leer la foto.', 'error'); };
    image.src = url;
  };

  const finalizarAuditoria = async () => {
    if (isSubmitting || closingRef.current) return;
    if (datosEjemplo) {
      showToast('Revisá o poné en cero los stocks de ejemplo antes del primer cierre.', 'error');
      return;
    }
    if (historialReportes.some(r => r.fecha === control.fechaAuditada)) {
      showToast('Esta jornada ya está cerrada; no se aplicará dos veces.', 'error');
      return;
    }
    if (control.asistencia.some(p => p.estado === 'pendiente') ||
        control.tareasAuditadas.some(t => t.realizadaEnTurno === null) ||
        control.ingresos.some(i => i.ingresaronViajes === null)) {
      showToast('Confirmá asistencia, tareas y viajes antes de cerrar.', 'error');
      return;
    }
    if (control.tareasAuditadas.some(t => t.realizadaEnTurno === false && !t.observacion?.trim())) {
      showToast('Anotá el motivo de cada tarea que no se realizó.', 'error');
      return;
    }
    if (control.asistencia.some(p => p.estado !== 'ausente' && p.rolReal === 'Maquinista' && !p.maquinaReal)) {
      showToast('Asociá una pala a cada maquinista presente.', 'error');
      return;
    }
    const asistenciaInvalida = control.asistencia.find(p => errorAsistencia(p));
    if (asistenciaInvalida) {
      showToast(`${asistenciaInvalida.operario}: ${errorAsistencia(asistenciaInvalida)}`, 'error'); return;
    }
    const sectoresRegistrados = control.tareasAuditadas.map(t => clave(t.sector));
    if (new Set(sectoresRegistrados).size !== sectoresRegistrados.length) {
      showToast('Cada sector puede figurar una sola vez en las tareas de esta auditoría.', 'error'); return;
    }
    if (control.tareasAuditadas.some(t => t.esNoPlanificada && !t.realizadaEnTurno)) {
      showToast('Una tarea extra debe constar como realizada.', 'error'); return;
    }
    if (control.tareasAuditadas.some(t => t.realizadaEnTurno && !(t.turnosRealizados?.length || t.turnos?.length || t.turno))) {
      showToast('Indicá en qué turno se realizó cada tarea.', 'error'); return;
    }
    let balance;
    try {
      balance = calcularBalanceJornada({ playa: stockPlaya, silos: stockSilos,
        cajon2: stockCajon2, ingresos: control.ingresos,
        movimientos: control.paladasMovimientos, transferenciasConos: control.transferenciasConos,
        maquinas, densidad: densidadTierra });
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
    closingRef.current = true;
    setIsSubmitting(true);
    const nuevosAcopios = balance.acopios;
    const nuevosSilos = balance.conos;
    const totTonIng = control.ingresos.filter(i => i.ingresaronViajes)
      .reduce((a, c) => a + numero(c.volumenRealTon), 0);
    const totM3Mov = control.paladasMovimientos.reduce((a, mov) => a +
      numero(mov.cantPaladas) * numero(maquinas.find(m => m.nombre === mov.maquina)?.m3PorPalada ?? 3), 0);
    const totPal = control.paladasMovimientos.reduce((a, c) => a + numero(c.cantPaladas), 0);
    const totMinParada = control.paradasMaquinas.reduce((a, c) => a +
      calcularMinutosParada(c.horaInicio, c.horaFin, c.continuaParada), 0);
    const tareasHechas = control.tareasAuditadas.filter(t => t.realizadaEnTurno).length;
    const tareasTotal = control.tareasAuditadas.length;
    const reporteId = nuevoId();

    const payload = {
      Turnos: [
        {
          timestampSincronizacion: new Date().toISOString(),
          fecha: control.fechaAuditada,
          auditor: "Jefe de Turno Molienda",
          totalToneladasIngreso: totTonIng,
          totalM3Movidos: totM3Mov,
          totalPaladas: totPal,
          totalMinutosParada: totMinParada,
          tareasRealizadasEnTurno: `${tareasHechas} de ${tareasTotal}`,
          indicacionesSemana: plan.observacionSemanal ?? ''
        }
      ],
      Personal: control.asistencia.map(p => ({
        fecha: control.fechaAuditada,
        operario: p.operario,
        puestoPlanificado: p.rolPlanificado,
        puestoReal: p.rolReal,
        cambioDePuesto: p.rolReal !== p.rolPlanificado ? "SÍ" : "NO",
        maquinaPlanificada: p.maquinaPlanificada || "-",
        maquinaReal: p.maquinaReal || "-",
        cambioDeMaquina: p.maquinaReal !== p.maquinaPlanificada ? "SÍ" : "NO",
        tuvoParadaPala: control.paradasMaquinas.some(pr => pr.maquinista === p.operario) ? "SÍ" : "NO",
        cantParadasPala: control.paradasMaquinas.filter(pr => pr.maquinista === p.operario).length,
        estadoAsistencia: p.estado,
        horaInicioReal: p.inicioReal || "-",
        horaFinReal: p.finReal || "-",
        diferenciaEntradaMin: p.estado === 'ausente' ? null : diferenciaMinutosHorario(p.inicio, p.inicioReal),
        diferenciaSalidaMin: p.estado === 'ausente' ? null : diferenciaMinutosHorario(p.fin, p.finReal),
        observacion: p.observacion || ""
      })),
      Movimientos: control.paladasMovimientos.map(m => ({
        fecha: control.fechaAuditada,
        maquinista: m.maquinista,
        maquina: m.maquina,
        capacidadBaldeM3: numero(maquinas.find(p => p.nombre === m.maquina)?.m3PorPalada ?? 3),
        origen: m.origen,
        destino: m.destino,
        cantPaladas: m.cantPaladas,
        volumenM3Calculado: balance.traza.find(t => t.id === m.id)?.volumenM3 ?? 0,
        densidadAplicada: balance.traza.find(t => t.id === m.id)?.densidadAplicada ?? null,
        humedadNivel: balance.traza.find(t => t.id === m.id)?.humedadNivel ?? null,
        toneladasEstimadas: balance.traza.find(t => t.id === m.id)?.toneladas ?? 0,
        observaciones: m.observaciones || ""
      })),
      Paradas: control.paradasMaquinas.map(pr => ({
        fecha: control.fechaAuditada,
        maquina: pr.maquina,
        maquinista: pr.maquinista,
        motivoDesperfecto: pr.motivoDesperfecto,
        horaInicio: pr.horaInicio,
        horaFin: pr.continuaParada ? "CONTINÚA" : pr.horaFin,
        minutosParados: calcularMinutosParada(pr.horaInicio, pr.horaFin, pr.continuaParada),
        continuaParada: pr.continuaParada ? "SÍ" : "NO",
        resuelto: pr.resuelto ? "SÍ" : "NO",
        observaciones: pr.observaciones || ""
      })),
      Tareas: control.tareasAuditadas.map(t => ({ fecha: control.fechaAuditada, accion: t.accion,
        sector: t.sector, turnos: t.turnosRealizados ?? t.turnos ?? [t.turno], realizada: t.realizadaEnTurno,
        observacion: t.observacion || '', fotoInicioLocal: !!t.fotoInicio, fotoFinLocal: !!t.fotoFin })),
      TransferenciasConos: (control.transferenciasConos ?? []).map(t => {
        const traza = balance.traza.find(x => x.id === t.id);
        return { fecha: control.fechaAuditada, origen: traza?.origen, destino: traza?.destino,
          paladas: traza?.paladas ?? 0, toneladas: traza?.toneladas ?? 0, motivo: t.motivo };
      }),
      MES_Indicaciones: (plan.indicacionesEstructuradas ?? []).map(t => ({ fecha: control.fechaAuditada,
        textoOriginal: plan.observacionOriginal ?? plan.observacionSemanal,
        textoAprobado: plan.observacionSemanal, categoria: t.categoria, descripcion: t.descripcion,
        sector: t.sector, turno: t.turno, validada: !!t.validada })),
      CalidadTierra: control.ingresos.map(c => ({
        fecha: control.fechaAuditada,
        origen: c.origen,
        destino: c.destino,
        ingresaronViajes: c.ingresaronViajes ? "SÍ" : "NO",
        volumenRealTon: c.volumenRealTon,
        resumenEvaluacion0a3: Object.entries(c.calidadesEvaluadas || {}).map(([k, v]) => `${k}:${v}`).join(', '),
        ...c.calidadesEvaluadas,
        observaciones: c.observacion || ""
      })),
      AcopiosPlaya: nuevosAcopios.map(a => ({
        id: a.id,
        nombre: a.nombre,
        sector: a.sector,
        cuadrante: a.cuadrante || sectores.find(x => x.nombre === a.sector)?.cuadrante || '',
        pisos: a.pisos,
        toneladas: a.toneladas,
        m3Estimados: a.m3Estimados,
        activo: a.activo
      })),
      BalanceSilos: nuevosSilos.map(s => ({ nombre: s.nombre,
        antesTon: numero(stockSilos.find(x => x.id === s.id)?.toneladas),
        entradasTon: redondear(balance.traza.filter(t => clave(t.destino) === clave(s.nombre)).reduce((n, t) => n + t.toneladas, 0)),
        salidasTon: redondear(balance.traza.filter(t => clave(t.origen) === clave(s.nombre)).reduce((n, t) => n + t.toneladas, 0)),
        finalTon: s.toneladas, humedadNivel: s.humedadNivel ?? 1, paladasOperativas: s.paladasOperativas ?? 0 }))
    };

    const nuevoReporte = {
      id: reporteId,
      fecha: control.fechaAuditada,
      auditadoPor: "Jefe de Turno Molienda",
      totalToneladasIngresadas: redondear(totTonIng),
      totalM3Movidos: redondear(totM3Mov),
      totalPaladas: totPal,
      totalMinutosParada: totMinParada,
      cumplimientoTareasPct: tareasTotal > 0 ? Math.round((tareasHechas / tareasTotal) * 100) : 100,
      consumoProduccionTon: balance.consumo,
      despachoYBTon: balance.despacho,
      balanceSilos: nuevosSilos.map(s => ({ nombre: s.nombre, antesTon: numero(stockSilos.find(x => x.id === s.id)?.toneladas),
        entradasTon: redondear(balance.traza.filter(t => clave(t.destino) === clave(s.nombre)).reduce((n, t) => n + t.toneladas, 0)),
        salidasTon: redondear(balance.traza.filter(t => clave(t.origen) === clave(s.nombre)).reduce((n, t) => n + t.toneladas, 0)),
        finalTon: s.toneladas })),
      stockPostCierre: { acopios: nuevosAcopios.map(a => ({ id: a.id, nombre: a.nombre,
        toneladas: a.toneladas, humedadNivel: nivelHumedad(a.calidades?.Humedad ?? 1) })),
        conos: nuevosSilos.map(s => ({ id: s.id, nombre: s.nombre, toneladas: s.toneladas,
          humedadNivel: nivelHumedad(s.humedadNivel ?? 1), paladasOperativas: numero(s.paladasOperativas) })), cajon2: balance.cajon2 },
      stockPreCierre: { acopios: stockPlaya.map(a => ({ id: a.id, nombre: a.nombre, toneladas: a.toneladas })),
        conos: stockSilos.map(s => ({ id: s.id, nombre: s.nombre, toneladas: s.toneladas })), cajon2: stockCajon2 },
      sincronizacion: 'pendiente',
      payload,
      controlData: structuredClone(control)
    };

    try {
      setStockPlaya(nuevosAcopios);
      setStockSilos(nuevosSilos);
      setStockCajon2(balance.cajon2);
      setHistorialReportes(prev => [nuevoReporte, ...prev]);
      setReporteSeleccionado(nuevoReporte);
      setCurrentView('reportView');
      showToast('Jornada cerrada. Inventario actualizado una sola vez.');
      if (appsScriptUrl && appsScriptUrl !== 'URL_AQUI') {
        await sincronizarReporte(nuevoReporte);
      }
    } finally {
      closingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const sincronizarReporte = async (reporte) => {
    if (!reporte?.payload) {
      showToast('El detalle histórico de esta jornada pertenece a la versión anterior. Exportá el respaldo original.', 'error');
      return;
    }
    if (!appsScriptUrl || appsScriptUrl === 'URL_AQUI') {
      showToast('Configurá la URL de Apps Script en Parámetros.', 'error');
      return;
    }
    try {
      if (!estadoSheet.aplicado || !estadoSheet.etag)
        throw new Error('Consultá primero los valores validados en Configuración. No se sobrescribirá la planilla.');
      const resultado = await consultarAppsScript('saveAudit', { payload: {
        action: 'saveAudit', schema: 2, id: reporte.id, expectedEtag: estadoSheet.etag,
        data: reporte.payload, stock: reporte.stockPostCierre
      } });
      setEstadoSheet(prev => ({ ...prev, revision: resultado.revision, etag: resultado.etag,
        actualizado: new Date().toISOString(), aplicado: true }));
      setHistorialReportes(prev => prev.map(r => r.id === reporte.id ? { ...r, sincronizacion: 'confirmada' } : r));
      setReporteSeleccionado(prev => prev?.id === reporte.id ? { ...prev, sincronizacion: 'confirmada' } : prev);
      showToast('Auditoría confirmada por Google Sheets.');
      try { await generarInforme(reporte.id); }
      catch (error) { showToast(`Cierre guardado. El PDF puede generarse desde el informe: ${error.message}`, 'error'); }
    } catch (error) {
      showToast(`Sincronización pendiente: ${error.message}. El cierre permanece guardado localmente.`, 'error');
    }
  };

  const generarInforme = async id => {
    const respuesta = await consultarAppsScript('generateReport', { payload: { action: 'generateReport', id } });
    setHistorialReportes(prev => prev.map(r => r.id === id ? { ...r, informe: respuesta.informe } : r));
    setReporteSeleccionado(prev => prev?.id === id ? { ...prev, informe: respuesta.informe } : prev);
    return respuesta.informe;
  };

  const themeClasses = {
    bg: darkMode ? 'bg-[#10191d] text-slate-100' : 'bg-[#f1f3f2] text-slate-900',
    card: darkMode ? 'bg-[#1a282d] border-[#34454b]' : 'bg-white border-[#d7dfde] shadow-sm',
    cardSecondary: darkMode ? 'bg-[#223239] border-[#3b4b50]' : 'bg-[#f7f9f8] border-[#d7dfde]',
    input: darkMode ? 'bg-[#132126] border-[#44565b] text-white placeholder-slate-400 focus:border-teal-400' : 'bg-white border-[#b8c6c5] text-slate-900 placeholder-slate-500 focus:border-teal-700',
    subtext: darkMode ? 'text-slate-300' : 'text-slate-600'
  };
  let saldoConosProvisorio = stockSilos;
  try {
    saldoConosProvisorio = calcularBalanceJornada({ playa: stockPlaya, silos: stockSilos,
      cajon2: stockCajon2, ingresos: control.ingresos.filter(i => i.ingresaronViajes !== null),
      movimientos: control.paladasMovimientos, transferenciasConos: control.transferenciasConos ?? [],
      maquinas, densidad: densidadTierra }).conos;
  } catch { /* La validación detallada se muestra al cerrar. */ }

  const renderWelcome = () => renderDashboard();

  const renderDashboard = () => {
    const diasVencidos = getDiasVencidos();
    const pendientesRecordatorios = recordatorios.filter(r => !r.completado).length;
    const fuenteClima = lecturasClima.met?.dias?.length ? lecturasClima.met : lecturasClima.accuweather?.dias?.length ? lecturasClima.accuweather : lecturasClima.weather;
    const diasClima = (fuenteClima?.dias ?? []).slice(0, 3);
    const toneladasPlaya = redondear(stockPlaya.reduce((s, a) => s + numero(a.toneladas), 0));
    const toneladasConos = redondear(stockSilos.reduce((s, a) => s + numero(a.toneladas), 0));
    const acopiosActivos = stockPlaya.filter(a => a.activo !== false).length;
    const conosActivos = stockSilos.filter(s => s.activo !== false).length;
    const nav = [
      { nombre: 'Planificación', icono: <Icons.Calendar />, accion: () => { setCurrentView('planning'); setCurrentStep(1); } },
      { nombre: 'Plano de playa', icono: <Icons.Map />, accion: () => setCurrentView('planoPlaya') },
      { nombre: 'Balance de silos', icono: <Icons.Database />, accion: () => setCurrentView('balanceSilos') },
      { nombre: 'Conciliación', icono: <Icons.Database />, accion: () => setCurrentView('conciliacion') },
      { nombre: 'Datos validados', icono: <Icons.Factory />, accion: () => setCurrentView('datosValidados') },
      { nombre: 'Clima', icono: <Icons.Sun />, accion: () => setCurrentView('clima') },
      { nombre: 'Histórico', icono: <Icons.Clock />, accion: () => setCurrentView('historico') },
      { nombre: `Pizarrón${pendientesRecordatorios ? ` · ${pendientesRecordatorios}` : ''}`, icono: <Icons.Bell />, accion: () => setCurrentView('recordatorios') },
      { nombre: 'Ayuda y mejoras', icono: <Icons.Settings />, accion: () => setCurrentView('asistente') }
    ];
    const indicadores = [
      { etiqueta: 'Tierra en playa', valor: toneladasPlaya, unidad: 't', nota: `${acopiosActivos} acopios activos`, clase: 'clay' },
      { etiqueta: 'Disponible en conos', valor: conosValidados ? toneladasConos : '—', unidad: conosValidados ? 't' : '', nota: `${conosActivos} conos activos`, clase: 'teal' },
      { etiqueta: 'Cajón 2', valor: redondear(stockCajon2), unidad: 't', nota: 'Pendiente de distribución', clase: 'steel' },
      { etiqueta: 'Jornadas pendientes', valor: diasVencidos.length, unidad: '', nota: 'Auditorías por cerrar', clase: diasVencidos.length ? 'amber' : 'teal' }
    ];
    return <main className={`mes-home min-h-screen ${themeClasses.bg}`}>
      <div className="mes-home-wrap">
        <header className="mes-home-header">
          <div className="mes-brand">
            <div className="mes-brand-mark"><Icons.Factory /></div>
            <div>
              <p className="mes-overline">CERÁMICA MARCOS PAZ <span className="mes-overline-separator">/</span> CEVIL POZO</p>
              <h1>Playa de materia prima</h1>
              <p className="mes-header-subtitle">Molienda · Tierra para ladrillos huecos</p>
            </div>
          </div>
          <div className="mes-header-actions">
            <div className="mes-header-clock" aria-label="Fecha y hora de planta">
              <span>{liveDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <strong>{liveDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })} <small>ARG</small></strong>
            </div>
            <button type="button" className="mes-icon-button" onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={darkMode ? 'Modo claro' : 'Modo oscuro'}>
              {darkMode ? <Icons.Sun /> : <Icons.Moon />}
            </button>
            <button type="button" className="mes-icon-button" onClick={() => { setPinDestino('catalogos'); setModalPinAbierto(true); }}
              aria-label="Configuración de supervisor" title="Configuración"><Icons.Settings /></button>
          </div>
        </header>

        <nav className="mes-home-nav" aria-label="Módulos del sistema">
          {nav.map(item => <button type="button" key={item.nombre} onClick={item.accion}>
            <span className="mes-nav-icon">{item.icono}</span>{item.nombre}
          </button>)}
        </nav>

        <div className="mes-home-intro">
          <div><p className="mes-overline">PANEL OPERATIVO <span className="mes-overline-separator">/</span> SITUACIÓN ACTUAL</p>
            <h2>Resumen de playa y silos</h2>
            <p>Planificá la recepción, ubicá acopios y cerrá los movimientos de cada jornada.</p></div>
          <div className={`mes-source-badge ${datosEjemplo ? 'is-demo' : estadoSheet.estado === 'conectado' ? 'is-connected' : 'is-local'}`}>
            <span className="mes-status-dot" />{datosEjemplo ? 'Datos de ejemplo' : estadoSheet.estado === 'conectado' ? 'Planilla conectada' : 'Base validada · 24/09/2026'}
          </div>
        </div>

        {datosEjemplo && <div className="mes-notice" role="status">
          <div className="mes-notice-icon"><Icons.Alert /></div>
          <p><strong>Inventario de demostración.</strong> Los saldos, personas, viajes y avisos iniciales son ejemplos. Revisá todo antes de registrar operaciones reales.</p>
          <div className="mes-notice-actions">
            <button type="button" onClick={() => { stockPlaya.forEach(a => registrarAjusteManual(a.nombre, numero(a.toneladas), 0, 'Puesta en cero de ejemplo'));
              stockSilos.forEach(s => registrarAjusteManual(s.nombre, numero(s.toneladas), 0, 'Puesta en cero de ejemplo'));
              registrarAjusteManual('Cajón 2', stockCajon2, 0, 'Puesta en cero de ejemplo');
              setStockPlaya(prev => prev.map(a => ({ ...a, toneladas: 0, paladas: 0, m3Estimados: 0 })));
              setStockSilos(prev => prev.map(s => ({ ...s, toneladas: 0 }))); setStockCajon2(0);
              showToast('Stocks de ejemplo puestos en cero. Revisá también el plan y los catálogos.'); }}>Poner saldos en cero</button>
            <button type="button" onClick={() => setDatosEjemplo(false)}>Ya revisé los datos</button>
          </div>
        </div>}
        {migracionParcial && <div className="mes-notice mes-notice-info">Se recuperaron datos de la versión anterior. Revisá la planificación y exportá el respaldo desde Configuración antes de operar.</div>}

        {!conosValidados && <div className="mes-notice mes-notice-info" role="status">
          <div className="mes-notice-icon"><Icons.Alert /></div>
          <p><strong>Conos sin saldo inicial validado.</strong> La planilla registra los tres acopios, pero no el stock de cada cono. Los ceros indican saldo pendiente de conciliación; registrá los valores medidos en Inventario antes de usar el balance para decisiones de producción.</p>
        </div>}
        <section className="mes-kpis" aria-label="Indicadores de existencias">
          {indicadores.map(x => <article key={x.etiqueta} className={`mes-kpi mes-kpi-${x.clase}`}>
            <span className="mes-kpi-label">{x.etiqueta}</span>
            <strong>{x.valor.toLocaleString('es-AR')} <small>{x.unidad}</small></strong>
            <span className="mes-kpi-note">{x.nota}</span>
          </article>)}
        </section>

        <div className="mes-home-columns">
          <div className="mes-home-main">
            <div className="mes-section-heading"><div><p className="mes-overline">OPERACIÓN</p><h3>Flujo de trabajo</h3></div>
              <span>Planificar → ubicar → auditar</span></div>
            <div className="mes-workflows">
              <article className="mes-workflow">
                <div className="mes-workflow-index">01</div>
                <div className="mes-workflow-content"><h4>Plan semanal</h4>
                  <p>Personal por turno, tareas de suelo, nuevos acopios y descarga de camiones.</p>
                  <span className="mes-workflow-meta">{plan.activa ? `Vigente: ${plan.fechaInicio} al ${plan.fechaFin}` : 'Sin plan confirmado'}</span></div>
                <button type="button" onClick={() => { setCurrentView('planning'); setCurrentStep(1); }}>
                  {plan.activa ? 'Abrir plan' : 'Crear plan'} <Icons.ArrowRight /></button>
              </article>
              <article className="mes-workflow">
                <div className="mes-workflow-index">02</div>
                <div className="mes-workflow-content"><h4>Plano de playa</h4>
                  <p>Acopios, sectores, límites, cajones y silos en un esquema editable.</p>
                  <span className="mes-workflow-meta">{acopiosActivos} acopios · {plan.recetasAcopio?.length ?? 0} recetas previstas</span></div>
                <button type="button" onClick={() => setCurrentView('planoPlaya')}>Abrir plano <Icons.ArrowRight /></button>
              </article>
              <article className="mes-workflow">
                <div className="mes-workflow-index">03</div>
                <div className="mes-workflow-content"><h4>Auditoría diaria</h4>
                  <p>Confirmá asistencia, viajes y paladas; el cierre actualiza las existencias.</p>
                  <span className="mes-workflow-meta">{diasVencidos.length ? `${diasVencidos.length} jornada(s) por cerrar` : 'Sin jornadas vencidas pendientes'}</span></div>
                <div className="mes-workflow-audit">
                  {diasVencidos.length ? <><select id="dateSelectDash" aria-label="Jornada a auditar">
                    {diasVencidos.map(d => <option key={d} value={d}>{d}</option>)}
                  </select><button type="button" onClick={() => {
                    const el = document.getElementById('dateSelectDash'); iniciarControl(el ? el.value : diasVencidos[0]);
                  }}>Iniciar <Icons.ArrowRight /></button></> : <span className="mes-workflow-complete">Al día</span>}
                </div>
              </article>
            </div>
            {plan.observacionSemanal?.trim() && <section className="mes-week-note"><p className="mes-overline">INDICACIONES DE LA SEMANA · {plan.fechaInicio} AL {plan.fechaFin}</p>
              <p>{plan.observacionSemanal}</p></section>}
            {historialReportes.length > 0 && <section className="mes-recent">
              <div className="mes-section-heading"><div><p className="mes-overline">TRAZABILIDAD</p><h3>Últimas jornadas</h3></div>
                <button type="button" onClick={() => setCurrentView('historico')}>Ver histórico <Icons.ArrowRight /></button></div>
              <div className="mes-recent-list">{historialReportes.slice(0, 5).map(r => <button type="button" key={r.id}
                onClick={() => { setReporteSeleccionado(r); setCurrentView('reportView'); }}>
                <strong>{r.fecha}</strong><span>{r.totalToneladasIngresadas} t recibidas</span>
                <em>{r.sincronizacion === 'confirmada' ? 'Sincronizada' : 'Pendiente de sincronizar'}</em><Icons.ArrowRight />
              </button>)}</div>
            </section>}
          </div>
          <aside className="mes-home-aside">
            <section className="mes-aside-card">
              <div className="mes-aside-top"><span className="mes-aside-icon"><Icons.Database /></span><span>INVENTARIO</span></div>
              <h3>Balance de conos</h3>
              <p>Seguimiento de entradas desde molienda y salidas auditadas a producción.</p>
              <div className="mes-cone-list">{stockSilos.filter(s => s.activo !== false).map(s => <div key={s.id}>
                <div><span>{s.nombre}</span><strong>{redondear(numero(s.toneladas))} t</strong></div>
                <span className="mes-cone-track"><i style={{ width: `${Math.min(100, Math.max(0, numero(s.toneladas) / Math.max(1, ...stockSilos.map(x => numero(x.toneladas))) * 100))}%` }} /></span>
              </div>)}</div>
              <button type="button" className="mes-text-link" onClick={() => setCurrentView('balanceSilos')}>Ver balance completo <Icons.ArrowRight /></button>
            </section>
            <section className="mes-aside-card mes-aside-weather">
              <div className="mes-aside-top"><span className="mes-aside-icon"><Icons.Sun /></span><span>PLANIFICACIÓN DE PLAYA</span></div>
              <h3>Pronóstico del tiempo</h3>
              <p>Comparativa automática de The Weather Channel y AccuWeather para planificar descargas y trabajos de suelo.</p>
              {diasClima.length ? <div className="mes-weather-days">
                {diasClima.map(d => <div key={d.fecha}><span>{new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })}</span>
                  <strong>{d.max === null ? '—' : `${d.max}°`}</strong><em>{d.lluvia === null ? 'Lluvia —' : `${d.lluvia}% lluvia`}</em></div>)}
                <small>Última consulta: {lecturasClima.actualizado ? new Date(lecturasClima.actualizado).toLocaleString('es-AR') : 'sin fecha'}</small>
              </div> : <div className="mes-weather-status">Conexión de proveedores pendiente</div>}
              <button type="button" className="mes-text-link" onClick={() => setCurrentView('clima')}>Abrir pronóstico <Icons.ArrowRight /></button>
            </section>
            <section className="mes-aside-card mes-aside-shortcuts">
              <div className="mes-aside-top"><span className="mes-aside-icon"><Icons.Bell /></span><span>COMUNICACIONES</span></div>
              <h3>{pendientesRecordatorios} avisos pendientes</h3>
              <p>Órdenes y recordatorios para turnos y operadores de la playa.</p>
              <button type="button" className="mes-text-link" onClick={() => setCurrentView('recordatorios')}>Abrir pizarrón <Icons.ArrowRight /></button>
            </section>
          </aside>
        </div>
        <footer className="mes-home-footer"><span>GESTIÓN MOLIENDA · CMP</span><span>El plano es esquemático. Verificá pesajes y humedad antes de tomar decisiones operativas.</span></footer>
      </div>
    </main>;
  };

  const renderPlanoPlaya = (editar = false) => {
    const modoMapa = editar ? mapInteractionMode : 'view';
    const recetasPendientes = plan.recetasAcopio.filter(
      rec => !stockPlaya.some(a => a.nombre.toLowerCase().trim() === rec.nombreNuevoAcopio.toLowerCase().trim())
    );
    const objetoPlano = objetoSeleccionadoPlano?.tipo === 'nave' ? posicionNaveMolienda
      : objetoSeleccionadoPlano?.tipo === 'silo' ? posicionSiloConos
        : objetoSeleccionadoPlano?.tipo === 'cajon' ? posicionCajones[objetoSeleccionadoPlano.id]
          : objetoSeleccionadoPlano?.tipo === 'cono' ? posicionConos[objetoSeleccionadoPlano.id]
            : elementosMapa.find(a => a.id === objetoSeleccionadoPlano?.id);
    const actualizarObjetoPlano = (campo, valor) => {
      const { tipo, id } = objetoSeleccionadoPlano;
      if (tipo === 'nave') setPosicionNaveMolienda(prev => ({ ...prev, [campo]: valor }));
      if (tipo === 'silo') setPosicionSiloConos(prev => ({ ...prev, [campo]: valor }));
      if (tipo === 'cajon') setPosicionCajones(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
      if (tipo === 'cono') setPosicionConos(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
      if (tipo === 'elemento') setElementosMapa(prev => prev.map(a => a.id === id ? { ...a, [campo]: valor } : a));
    };

    return (
      <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8 flex flex-col transition-colors duration-300 select-none relative`}>
        <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 space-y-6">
          <header className={`${themeClasses.card} p-6 rounded-3xl border flex flex-wrap justify-between items-center gap-4 relative z-40 `}>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-400 text-xs font-black uppercase tracking-wider mb-2 border border-cyan-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{editar ? 'Editor del plano' : 'Consulta interactiva'} • 8.817,24 m² referenciales</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black flex items-center gap-3">
                <Icons.Map />
                <span>Plano de Playa de Logística & Control de Pisos</span>
              </h2>
              <p className={`${themeClasses.subtext} text-xs mt-1 max-w-3xl`}>
                {editar ? 'Ubicá y dimensioná acopios, cajones, conos y límites.' : 'Seleccioná un acopio o cono para consultar sus datos.'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!editar && <button type="button" className="px-3 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold"
                onClick={() => { setPinDestino('editorPlano'); setModalPinAbierto(true); }}>🔒 Editar desde Configuración</button>}
              {editar && <button type="button" className="px-3 py-2 rounded-xl bg-cyan-600 text-white text-xs font-bold"
                onClick={() => { setMapaDesbloqueado(false); setMapInteractionMode('view'); setCurrentView('catalogos'); }}>🔓 Bloquear editor</button>}
              {editar && <div className={`p-1 rounded-2xl border flex items-center gap-1 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                <button
                  type="button"
                  onClick={() => setMapInteractionMode('view')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${modoMapa === 'view' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Inspección
                </button>
                <button
                  type="button"
                  onClick={() => setMapInteractionMode('acopios')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${modoMapa === 'acopios' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Mover Acopios
                </button>
                <button
                  type="button"
                  onClick={() => setMapInteractionMode('sectores')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${modoMapa === 'sectores' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Mover Sectores
                </button>
                <button
                  type="button"
                  onClick={() => setMapInteractionMode('limites')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${modoMapa === 'limites' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Límites Terreno
                </button>
                <button
                  type="button"
                  onClick={() => { setMapInteractionMode('tolvas_silos'); setAcopioSeleccionadoPlano(null); setSectorSeleccionadoPlano(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${modoMapa === 'tolvas_silos' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  Tolvas & Silos
                </button>
              </div>}

              {editar && modoMapa === 'limites' && (
                <button
                  type="button"
                  onClick={agregarVerticePoligono}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-md"
                >
                  <Icons.Plus /> <span>+ Vértice</span>
                </button>
              )}
              {editar && modoMapa === 'sectores' && <button type="button" className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
                onClick={() => { const nuevo = { id: nuevoId(), nombre: `Sector ${sectoresVirtuales.length + 1}`,
                  tipo: 'playa', x: 350, y: 180, w: 130, h: 90, color: '#14b8a6', desc: '' };
                  setSectoresVirtuales(prev => [...prev, nuevo]); setSectorSeleccionadoPlano(nuevo); setAcopioSeleccionadoPlano(null); }}>
                + Sector
              </button>}
              {editar && modoMapa === 'tolvas_silos' && <>
                <button type="button" className="px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold"
                  onClick={() => { const nuevo = { id: nuevoId(), nombre: `Cono ${stockSilos.length + 1}`,
                    toneladas: 0, humedadNivel: 1, activo: true };
                    setStockSilos(prev => [...prev, nuevo]); setPosicionConos(prev => ({ ...prev,
                      [nuevo.id]: { x: 315 + (stockSilos.length % 7) * 70, y: 420, r: 19 } }));
                    setDestinosGenerales(prev => [...prev, { id: nuevoId(), nombre: nuevo.nombre,
                      tipo: 'silo', activo: true, desc: 'Cono agregado desde el plano' }]);
                    setObjetoSeleccionadoPlano({ tipo: 'cono', id: nuevo.id }); }}>+ Cono</button>
                <button type="button" className="px-3 py-2 rounded-xl bg-sky-700 text-white text-sm font-bold"
                  onClick={() => { const nuevo = { id: nuevoId(), nombre: `Elemento ${elementosMapa.length + 1}`,
                    x: 580, y: 280, w: 100, h: 65, forma: 'rectangulo', color: '#0284c7' };
                    setElementosMapa(prev => [...prev, nuevo]); setObjetoSeleccionadoPlano({ tipo: 'elemento', id: nuevo.id }); }}>
                  + Elemento</button>
              </>}

              {editar && <button
                onClick={() => {
                  const nuevo = {
                    id: nuevoId(),
                    nombre: `Acopio ${stockPlaya.length + 1}`,
                    sector: sectoresVirtuales[1]?.nombre || "Playa Logística Central",
                    posX: 440 + ((stockPlaya.length % 3) * 40),
                    posY: 140 + ((stockPlaya.length % 3) * 30),
                    radioBase: 30,
                    largoEje: 40,
                    pisos: 1,
                    paladas: 0,
                    toneladas: 0,
                    m3Estimados: 0,
                    origenReceta: "Acopio Libre",
                    textura: { arcilla: 60, arena: 20, limo: 20 },
                    calidades: { Humedad: 1, Caliza: 1, Raíces: 0, Basura: 0, Piedras: 0, "Tierra Negra": 0 },
                    activo: true,
                    esFuturo: false
                  };
                  setStockPlaya(prev => [...prev, nuevo]);
                  setAcopioSeleccionadoPlano(nuevo);
                  setMapInteractionMode('acopios');
                  showToast("Nuevo acopio añadido al plano.");
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Icons.Plus /> <span>+ Acopio</span>
              </button>}

              <button
                onClick={() => setCurrentView(editar ? 'catalogos' : 'dashboard')}
                className={`map-back px-4 py-2.5 rounded-xl font-bold text-xs border transition-colors cursor-pointer ${darkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white' : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'}`}
              >
                {editar ? 'Volver a Configuración' : 'Volver al Panel'}
              </button>
            </div>
          </header>

          {/* Banner de recetas pendientes de ubicar */}
          {recetasPendientes.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Icons.Layers />
                </span>
                <div>
                  <h4 className="text-xs font-black uppercase text-amber-400">
                    Acopios Planificados Pendientes de Ubicar ({recetasPendientes.length})
                  </h4>
                  <p className="text-xs text-slate-300">
                    Hay recetas de mezcla creadas en la planificación listas para ser localizadas en el terreno.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {recetasPendientes.map(rec => (
                  <button
                    key={rec.id}
                    onClick={() => ubicarAcopioFuturoEnPlano(rec)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition-colors flex items-center gap-1.5 shadow-md"
                  >
                    <span>Ubicar "{rec.nombreNuevoAcopio}"</span>
                    <span className="text-[10px] bg-slate-950/20 px-1.5 py-0.5 rounded font-mono">{rec.pisosPrevistos || 1}P</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reglas de Tráfico */}
          <div className="px-5 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-black">Nave Molienda:</span>
              <span className="text-slate-300">Recibe de canteras/acopios y envía a <strong>Silo (Conos)</strong> o directo a <strong>Cajón 3 (Producción)</strong>.</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="text-purple-400 font-black">Silo (Conos):</span>
              <span>Envía exclusivamente a <strong>Cajón 3 (Producción)</strong> o a <strong>CMP Yerba Buena</strong>.</span>
            </div>
            <span className="text-amber-400 font-black">Cajón 2: {redondear(stockCajon2)} t registradas</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
            <div className={`lg:col-span-2 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} p-6 rounded-3xl border flex flex-col justify-between shadow-2xl relative overflow-hidden`}>
              <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-cyan-400">
                  Modo Activo: {modoMapa === 'view' ? 'Inspección' : modoMapa === 'acopios' ? 'Mover Acopios' : modoMapa === 'sectores' ? 'Mover/Redimensionar Sectores' : modoMapa === 'tolvas_silos' ? 'Mover Tolvas y Conos Silo' : 'Deformar Vértices'}
                </span>

                <div className="flex items-center gap-4 text-xs font-black">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> 1P (Base)</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500"></span> 2P (Medio)</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500"></span> 3P (Pirámide)</span>
                </div>
              </div>

              {/* Lienzo SVG CAD de la Planta y Playa */}
              <div className={`relative w-full aspect-[16/9] rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                <svg
                  ref={svgPlanoRef}
                  viewBox="0 0 940 480"
                  className="w-full h-full cursor-crosshair touch-none"
                  onPointerDownCapture={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                  onPointerDown={handleSvgMouseDown}
                  onPointerMove={handleSvgMouseMove}
                  onPointerUp={handleSvgMouseUp}
                  onPointerCancel={handleSvgMouseUp}
                >
                  <defs>
                    <pattern id="gridCAD" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke={darkMode ? "#334155" : "#cbd5e1"} strokeWidth="0.75" strokeDasharray="3,3" />
                    </pattern>

                    <radialGradient id="gradPiso1" cx="45%" cy="40%" r="55%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="60%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#064e3b" />
                    </radialGradient>
                    <radialGradient id="gradPiso2" cx="45%" cy="40%" r="55%">
                      <stop offset="0%" stopColor="#fde047" />
                      <stop offset="65%" stopColor="#d97706" />
                      <stop offset="100%" stopColor="#78350f" />
                    </radialGradient>
                    <radialGradient id="gradPiso3" cx="45%" cy="40%" r="55%">
                      <stop offset="0%" stopColor="#e879f9" />
                      <stop offset="60%" stopColor="#9333ea" />
                      <stop offset="100%" stopColor="#4c1d95" />
                    </radialGradient>
                  </defs>

                  <rect width="940" height="480" fill="url(#gridCAD)" />

                  <polygon
                    points={stringPuntosPoligono}
                    fill={darkMode ? "#0f172a" : "#f8fafc"}
                    fillOpacity={darkMode ? 0.75 : 0.85}
                    stroke={darkMode ? "#38bdf8" : "#0284c7"}
                    strokeWidth="2.5"
                    strokeDasharray={modoMapa === 'limites' ? "none" : "6,4"}
                  />

                  <line x1={verticesPoligono[0].x} y1="20" x2={verticesPoligono[1].x} y2="20" stroke={darkMode ? "#38bdf8" : "#0284c7"} strokeWidth="1.5" />
                  <text x="470" y="16" fill={darkMode ? "#38bdf8" : "#0284c7"} fontSize="11" fontWeight="900" textAnchor="middle">
                    ← Linde Camino del Perú · 400 m según relevamiento (esquema sin calibrar) →
                  </text>

                  {/* Sectores Virtuales */}
                  {sectoresVirtuales.map((sec) => {
                    const isSelected = sectorSeleccionadoPlano?.id === sec.id;
                    return (
                      <g
                        key={sec.id}
                        className={modoMapa === 'sectores' ? 'cursor-move' : 'cursor-pointer'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSectorSeleccionadoPlano(sec);
                          setAcopioSeleccionadoPlano(null);
                        }}
                        onPointerDown={(e) => {
                          if (modoMapa === 'sectores') {
                            e.stopPropagation();
                            const coords = getSvgCoordinates(e);
                            setSectorSeleccionadoPlano(sec);
                            setDraggingEntity({
                              type: 'sector',
                              id: sec.id,
                              startCoords: coords,
                              initialX: sec.x,
                              initialY: sec.y
                            });
                          }
                        }}
                      >
                        {sec.forma === 'elipse' ? <ellipse cx={sec.x + sec.w / 2} cy={sec.y + sec.h / 2}
                          rx={sec.w / 2} ry={sec.h / 2} fill={sec.color} fillOpacity={isSelected ? .25 : .08}
                          stroke={sec.color} strokeWidth={isSelected ? 2.5 : 1.5} /> :
                          <rect x={sec.x} y={sec.y} width={sec.w} height={sec.h} fill={sec.color}
                            fillOpacity={isSelected ? .25 : .08} stroke={sec.color} strokeWidth={isSelected ? 2.5 : 1.5}
                            strokeDasharray={modoMapa === 'sectores' ? 'none' : '4,3'} rx="10" />}
                        <text x={sec.x + 10} y={sec.y + 18} fill={sec.color} fontSize="11" fontWeight="900">
                          {sec.nombre}
                        </text>

                        {modoMapa === 'sectores' && (
                          <rect
                            x={sec.x + sec.w - 12}
                            y={sec.y + sec.h - 12}
                            width="12"
                            height="12"
                            fill={sec.color}
                            className="cursor-se-resize"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setDraggingEntity({
                                type: 'sector_resize',
                                id: sec.id,
                                sectorX: sec.x,
                                sectorY: sec.y
                              });
                            }}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Nave de Molienda con Cajón 1, 2 y 3 Reubicable */}
                  <g
                    transform={`translate(${posicionNaveMolienda.x}, ${posicionNaveMolienda.y})`}
                    className={modoMapa === 'tolvas_silos' ? 'cursor-move' : ''}
                    onPointerDown={(e) => {
                      if (modoMapa === 'tolvas_silos') {
                        e.stopPropagation();
                        setObjetoSeleccionadoPlano({ tipo: 'nave' });
                        setDraggingEntity({ type: 'nave_molienda', startCoords: getSvgCoordinates(e),
                          initialX: posicionNaveMolienda.x, initialY: posicionNaveMolienda.y });
                      }
                    }}
                  >
                    <rect width={posicionNaveMolienda.w} height={posicionNaveMolienda.h} fill={darkMode ? "#1e293b" : "#e2e8f0"} stroke="#64748b" strokeWidth="2" rx="10" />
                    <text x={posicionNaveMolienda.w / 2} y="20" fill={darkMode ? "#f8fafc" : "#0f172a"} fontSize="10" fontWeight="900" textAnchor="middle">
                      NAVE DE MOLIENDA {modoMapa === 'tolvas_silos' ? '✋' : ''}
                    </text>
                    <text x={posicionNaveMolienda.w / 2} y="32" fill={darkMode ? "#94a3b8" : "#64748b"} fontSize="8" fontWeight="bold" textAnchor="middle">
                      ALIMENTACIÓN FABRIL
                    </text>

                    {modoMapa === 'tolvas_silos' && <rect x={posicionNaveMolienda.w - 14} y={posicionNaveMolienda.h - 14}
                      width="14" height="14" fill="#5eead4" className="cursor-se-resize"
                      onPointerDown={e => { e.stopPropagation(); setDraggingEntity({ type: 'nave_resize' }); }} />}
                  </g>

                  {/* Silo de Conos Reubicable y con Diámetro Configurable */}
                  <g
                    transform={`translate(${posicionSiloConos.x}, ${posicionSiloConos.y})`}
                    className={modoMapa === 'tolvas_silos' ? 'cursor-move' : ''}
                    onPointerDown={(e) => {
                      if (modoMapa === 'tolvas_silos') {
                        e.stopPropagation();
                        setObjetoSeleccionadoPlano({ tipo: 'silo' });
                        setDraggingEntity({ type: 'silo_conos', startCoords: getSvgCoordinates(e),
                          initialX: posicionSiloConos.x, initialY: posicionSiloConos.y });
                      }
                    }}
                  >
                    <rect width={posicionSiloConos.w} height={posicionSiloConos.h} fill={darkMode ? "#1e1b4b" : "#ede9fe"} stroke="#7c3aed" strokeWidth="1.5" rx="10" opacity="0.9" />

                    <text x={posicionSiloConos.w / 2} y="18" fill={darkMode ? "#c4b5fd" : "#6d28d9"} fontSize="10" fontWeight="900" textAnchor="middle">
                      BATERÍA DE SILOS
                    </text>
                    {modoMapa === 'tolvas_silos' && <rect x={posicionSiloConos.w - 14} y={posicionSiloConos.h - 14}
                      width="14" height="14" fill="#a78bfa" className="cursor-se-resize"
                      onPointerDown={e => { e.stopPropagation(); setDraggingEntity({ type: 'silo_resize' }); }} />}
                  </g>

                  {Object.entries(posicionCajones).filter(([, c]) => c.visible !== false).map(([id, c]) =>
                    <g key={id} className={modoMapa === 'tolvas_silos' ? 'cursor-move' : ''}
                      onClick={e => { e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'cajon', id }); setAcopioSeleccionadoPlano(null); }}
                      onPointerDown={e => { if (modoMapa !== 'tolvas_silos') return;
                        e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'cajon', id });
                        setDraggingEntity({ type: 'cajon', id, startCoords: getSvgCoordinates(e), initialX: c.x, initialY: c.y }); }}>
                      <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="7" fill={c.color} stroke="#e2e8f0" strokeWidth="1.5" />
                      <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{c.nombre}</text>
                      {modoMapa === 'tolvas_silos' && <rect x={c.x + c.w - 9} y={c.y + c.h - 9} width="12" height="12"
                        fill="#fbbf24" className="cursor-se-resize" onPointerDown={e => {
                          e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'cajon', id });
                          setDraggingEntity({ type: 'cajon_resize', id }); }} />}
                    </g>)}

                  {stockSilos.filter(s => s.activo).map((s, index) => {
                    const c = posicionConos[s.id] ?? { x: 335 + index * 50, y: 388, r: 19 };
                    return <g key={s.id} className={modoMapa === 'tolvas_silos' ? 'cursor-move' : ''}
                      onClick={e => { e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'cono', id: s.id }); setAcopioSeleccionadoPlano(null); }}
                      onPointerDown={e => { if (modoMapa !== 'tolvas_silos') return;
                        e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'cono', id: s.id });
                        setDraggingEntity({ type: 'cono', id: s.id, startCoords: getSvgCoordinates(e), initialX: c.x, initialY: c.y }); }}>
                      <circle cx={c.x} cy={c.y} r={c.r} fill="#6d28d9" stroke="#d8b4fe" strokeWidth="2" />
                      <text x={c.x} y={c.y + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{s.nombre.replace('Cono ', '')}</text>
                      <text x={c.x} y={c.y + c.r + 14} textAnchor="middle" fill="#c4b5fd" fontSize="10">{redondear(s.toneladas)} t</text>
                      {modoMapa === 'tolvas_silos' && <circle cx={c.x + c.r} cy={c.y} r="7" fill="#fbbf24"
                        className="cursor-ew-resize" onPointerDown={e => { e.stopPropagation();
                          setObjetoSeleccionadoPlano({ tipo: 'cono', id: s.id });
                          setDraggingEntity({ type: 'cono_resize', id: s.id }); }} />}
                    </g>;
                  })}

                  {elementosMapa.map(a => <g key={a.id} className={modoMapa === 'tolvas_silos' ? 'cursor-move' : ''}
                    onClick={e => { e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'elemento', id: a.id }); }}
                    onPointerDown={e => { if (modoMapa !== 'tolvas_silos') return;
                      e.stopPropagation(); setObjetoSeleccionadoPlano({ tipo: 'elemento', id: a.id });
                      setDraggingEntity({ type: 'elemento', id: a.id, startCoords: getSvgCoordinates(e), initialX: a.x, initialY: a.y }); }}>
                    {a.forma === 'elipse' ? <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2}
                      fill={a.color} fillOpacity=".55" stroke={a.color} strokeWidth="2" /> :
                      <rect x={a.x} y={a.y} width={a.w} height={a.h} rx="7" fill={a.color} fillOpacity=".55" stroke={a.color} strokeWidth="2" />}
                    <text x={a.x + a.w / 2} y={a.y + a.h / 2} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{a.nombre}</text>
                    {modoMapa === 'tolvas_silos' && <rect x={a.x + a.w - 9} y={a.y + a.h - 9} width="12" height="12"
                      fill="#fbbf24" className="cursor-se-resize" onPointerDown={e => { e.stopPropagation();
                        setObjetoSeleccionadoPlano({ tipo: 'elemento', id: a.id });
                        setDraggingEntity({ type: 'elemento_resize', id: a.id }); }} />}
                  </g>)}

                  {/* Vértices perimetrales */}
                  {modoMapa === 'limites' && verticesPoligono.map((v) => (
                    <g key={v.id} className="cursor-move">
                      <circle
                        cx={v.x}
                        cy={v.y}
                        r="9"
                        fill="#9333ea"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setVerticeSeleccionado(v.id);
                          setDraggingEntity({ type: 'vertice', id: v.id });
                        }}
                      />
                      <text x={v.x + 12} y={v.y - 8} fill="#c084fc" fontSize="10" fontWeight="900">
                        {v.label}
                      </text>
                    </g>
                  ))}

                  {/* Reservas visibles desde el paso 2, aun antes de confirmar el plan. */}
                  {recetasPendientes.map(rec => {
                    const sector = sectoresVirtuales.find(s => s.nombre === rec.sectorDestino) ?? sectoresVirtuales[1];
                    const x = (sector?.x ?? 400) + 55;
                    const y = (sector?.y ?? 150) + 50;
                    return <g key={`reserva-${rec.id}`} className="cursor-pointer" onClick={() => editar ? ubicarAcopioFuturoEnPlano(rec) :
                      (setAcopioSeleccionadoPlano({ id: `previsto-${rec.id}`, nombre: rec.nombreNuevoAcopio, toneladas: 0,
                        m3Estimados: 0, sector: rec.sectorDestino, esFuturo: true }), setObjetoSeleccionadoPlano(null))}>
                      <ellipse cx={x} cy={y} rx="44" ry="25" fill="#f59e0b" fillOpacity=".10"
                        stroke="#fbbf24" strokeWidth="3" strokeDasharray="7 5" />
                      <text x={x} y={y - 2} fill="#fef3c7" fontSize="11" fontWeight="900" textAnchor="middle">ACOPIO PREVISTO</text>
                      <text x={x} y={y + 13} fill="#fbbf24" fontSize="10" textAnchor="middle">{rec.nombreNuevoAcopio}</text>
                    </g>;
                  })}

                  {/* Acopios de Playa con Pendiente, Niveles de Pisos y Textura */}
                  {stockPlaya.map((acopio) => {
                    const isSelected = acopioSeleccionadoPlano?.id === acopio.id;
                    const rBase = acopio.radioBase || 32;
                    const lEje = acopio.largoEje || (rBase * 1.3);
                    const gradiente = acopio.pisos === 3 ? "url(#gradPiso3)" : acopio.pisos === 2 ? "url(#gradPiso2)" : "url(#gradPiso1)";

                    return (
                      <g
                        key={acopio.id}
                        transform={`translate(${acopio.posX || 450}, ${acopio.posY || 180})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAcopioSeleccionadoPlano(acopio);
                          setSectorSeleccionadoPlano(null);
                        }}
                        onPointerDown={(e) => {
                          if (modoMapa === 'acopios' || modoMapa === 'view') {
                            e.stopPropagation();
                            setAcopioSeleccionadoPlano(acopio);
                            setSectorSeleccionadoPlano(null);
                            if (modoMapa === 'acopios') {
                              const coords = getSvgCoordinates(e);
                              setDraggingEntity({ type: 'acopio', id: acopio.id, startCoords: coords,
                                initialX: acopio.posX, initialY: acopio.posY });
                            }
                          }
                        }}
                        className={modoMapa === 'acopios' ? 'cursor-move' : 'cursor-pointer'}
                      >
                        {isSelected && (
                          <ellipse cx="0" cy="0" rx={lEje + 14} ry={rBase + 12} fill="none" stroke="#67e8f9" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="6,5" />
                        )}

                        {/* Sombra de apoyo talud */}
                        <ellipse cx="4" cy="6" rx={lEje + 4} ry={rBase * 0.76} fill="#000000" fillOpacity="0.32" filter="blur(3px)" />

                        {/* Base Piso 1 */}
                        {acopio.forma === 'rectangulo' ?
                          <rect x={-lEje} y={-rBase * .72} width={lEje * 2} height={rBase * 1.44}
                            rx="9" fill={acopio.esFuturo ? '#92400e' : gradiente} stroke={acopio.esFuturo ? '#fbbf24' : '#ffffff'}
                            strokeWidth="2" strokeDasharray={acopio.esFuturo ? '7 4' : undefined} /> :
                          acopio.forma === 'triangulo' ?
                            <polygon points={`0,${-rBase * .95} ${lEje},${rBase * .7} ${-lEje},${rBase * .7}`}
                              fill={acopio.esFuturo ? '#92400e' : gradiente} stroke={acopio.esFuturo ? '#fbbf24' : '#ffffff'}
                              strokeWidth="2" strokeDasharray={acopio.esFuturo ? '7 4' : undefined} /> :
                            <ellipse cx="0" cy="0" rx={lEje} ry={rBase * 0.72} fill={acopio.esFuturo ? '#92400e' : gradiente}
                              stroke={acopio.esFuturo ? '#fbbf24' : '#ffffff'} strokeWidth="2" strokeDasharray={acopio.esFuturo ? '7 4' : undefined} opacity="0.92" />}

                        {/* Remonte Piso 2 */}
                        {acopio.pisos >= 2 && (
                          <g>
                            <ellipse cx="0" cy="-7" rx={lEje * 0.72} ry={rBase * 0.52} fill={gradiente} stroke="#ffffff" strokeWidth="1.2" opacity="0.96" />
                            <ellipse cx="0" cy="-7" rx={lEje * 0.65} ry={rBase * 0.46} fill="none" stroke="#fef08a" strokeWidth="0.8" strokeDasharray="3,2" />
                          </g>
                        )}

                        {/* Remonte Piso 3 (Pirámide) */}
                        {acopio.pisos === 3 && (
                          <g>
                            <ellipse cx="0" cy="-14" rx={lEje * 0.45} ry={rBase * 0.32} fill="#ffffff" stroke="#a855f7" strokeWidth="1.5" opacity="0.98" />
                            <circle cx="0" cy="-14" r="3.5" fill="#9333ea" />
                          </g>
                        )}

                        {/* Badge de Pisos */}
                        <circle cx={lEje - 4} cy={-rBase * 0.6} r="11" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
                        <text x={lEje - 4} y={-rBase * 0.6 + 4} fill="#22d3ee" fontSize="10" fontWeight="900" textAnchor="middle">
                          {acopio.pisos}P
                        </text>

                        {modoMapa === 'acopios' && (
                          <g>
                            <circle cx={lEje} cy="0" r="9" fill="#fbbf24" stroke="#0f172a" strokeWidth="3"
                              className="cursor-ew-resize" aria-label={`Cambiar largo de ${acopio.nombre}`}
                              onPointerDown={e => { e.stopPropagation(); setAcopioSeleccionadoPlano(acopio);
                                setDraggingEntity({ type: 'acopio_resize', id: acopio.id, axis: 'largoEje' }); }} />
                            <circle cx="0" cy={-rBase * 0.72} r="9" fill="#fbbf24" stroke="#0f172a" strokeWidth="3"
                              className="cursor-ns-resize" aria-label={`Cambiar ancho de ${acopio.nombre}`}
                              onPointerDown={e => { e.stopPropagation(); setAcopioSeleccionadoPlano(acopio);
                                setDraggingEntity({ type: 'acopio_resize', id: acopio.id, axis: 'radioBase' }); }} />
                          </g>
                        )}

                        {/* Mini Triángulo de Textura (% Arcilla, % Arena, % Limo) */}
                        <g transform={`translate(${-lEje + 6}, ${-rBase * 0.7})`}>
                          <polygon points="0,12 12,12 6,0" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
                          <circle cx="6" cy="7" r="2.5" fill={acopio.textura?.arcilla >= 60 ? "#10b981" : "#f59e0b"} />
                        </g>

                        {/* Etiqueta de Datos y Toneladas */}
                        <g transform="translate(0, 36)">
                          <rect x="-72" y="-12" width="144" height="26" rx="6" fill="#0f172a" fillOpacity="0.92" stroke="#334155" strokeWidth="1" />
                          <text x="0" y="0" fill="#ffffff" fontSize="10" fontWeight="900" textAnchor="middle">
                            {acopio.nombre}
                          </text>
                          <text x="0" y="10" fill="#22d3ee" fontSize="9" fontWeight="bold" textAnchor="middle">
                            {acopio.esFuturo ? 'PREVISTO · ' : ''}{acopio.toneladas} Ton • {acopio.paladas || Math.round(acopio.m3Estimados / 3)} Pal
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-3 flex flex-wrap justify-between items-center text-xs text-slate-400">
                <span>{modoMapa === 'acopios' ? 'Arrastre los acopios libremente.' : modoMapa === 'sectores' ? 'Arrastre un sector o use el tirador inferior derecho.' : modoMapa === 'tolvas_silos' ? 'Mueva la Nave de Molienda o el Silo para calibrar.' : modoMapa === 'limites' ? 'Mueva los vértices del terreno para calibrar.' : 'Haga clic en un acopio para inspeccionar y ajustar.'}</span>
                <span>Densidad: <strong>{densidadTierra} Ton/m³</strong> • Balde: <strong>3.0 m³</strong></span>
              </div>
            </div>

            {/* Panel Lateral de Propiedades, Triángulo de Suelo y Ajustes */}
            <div className={`${themeClasses.card} p-6 rounded-3xl border flex flex-col justify-between shadow-xl`}>
              {!editar ? <div className="space-y-4"><h3 className="font-bold text-lg">Detalle del plano</h3>
                {acopioSeleccionadoPlano ? <><h4 className="font-bold text-cyan-400">{acopioSeleccionadoPlano.nombre}</h4>
                  <p>{redondear(acopioSeleccionadoPlano.toneladas)} t · {redondear(acopioSeleccionadoPlano.m3Estimados || 0)} m³ estimados</p>
                  <p className="text-sm text-slate-400">Sector: {acopioSeleccionadoPlano.sector || 'Sin sector'} · Pisos: {acopioSeleccionadoPlano.pisos ?? '—'}</p>
                  <p className="text-sm text-slate-400">Humedad H{acopioSeleccionadoPlano.calidades?.Humedad ?? '—'} · Arcilla {acopioSeleccionadoPlano.textura?.arcilla ?? '—'}% · Arena {acopioSeleccionadoPlano.textura?.arena ?? '—'}% · Limo {acopioSeleccionadoPlano.textura?.limo ?? '—'}%</p></>
                : objetoSeleccionadoPlano?.tipo === 'cono' ? (() => { const cono = stockSilos.find(x => x.id === objetoSeleccionadoPlano.id);
                    return <><h4 className="font-bold text-violet-300">{cono?.nombre ?? 'Cono'}</h4><p>{redondear(cono?.toneladas ?? 0)} t</p>
                      <p className="text-sm text-slate-400">Paladas operativas registradas: {cono?.paladasOperativas ?? 0} · Humedad H{cono?.humedadNivel ?? '—'}</p></>; })()
                : objetoSeleccionadoPlano?.tipo === 'cajon' ? <><h4 className="font-bold">{posicionCajones[objetoSeleccionadoPlano.id]?.nombre}</h4><p className="text-sm text-slate-400">Cajón de la nave de molienda.</p></>
                : <p className="text-sm text-slate-400">Tocá un acopio o cono del plano para ver stock y características.</p>}</div> :
              modoMapa === 'limites' ? (
                <div className="space-y-4">
                  <h4 className="text-lg font-black text-violet-300">Límites del terreno</h4>
                  <p className="text-sm text-slate-400">Arrastrá los vértices, editá sus coordenadas o agregá y quitá puntos. La escala sigue siendo esquemática.</p>
                  {verticesPoligono.map(v => <button key={v.id} type="button" onClick={() => setVerticeSeleccionado(v.id)}
                    className={`block w-full text-left rounded-lg border p-2 text-sm ${verticeSeleccionado === v.id ? 'border-violet-400 bg-violet-500/20' : 'border-slate-700'}`}>
                    {v.label} · ({Math.round(v.x)}, {Math.round(v.y)})
                  </button>)}
                  {verticesPoligono.find(v => v.id === verticeSeleccionado) && <div className="space-y-2 border-t border-slate-700 pt-3">
                    {['label', 'x', 'y'].map(campo => <label key={campo} className="block text-sm text-slate-300">{campo === 'label' ? 'Nombre' : campo.toUpperCase()}
                      <input type={campo === 'label' ? 'text' : 'number'} value={verticesPoligono.find(v => v.id === verticeSeleccionado)[campo]}
                        onChange={e => setVerticesPoligono(prev => prev.map(v => v.id === verticeSeleccionado
                          ? { ...v, [campo]: campo === 'label' ? e.target.value : Math.max(0, Math.min(campo === 'x' ? 940 : 480, numero(e.target.value))) } : v))}
                        className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>)}
                    <button type="button" className="text-red-300 text-sm underline" onClick={() => {
                      if (verticesPoligono.length <= 3) return showToast('El terreno necesita al menos tres vértices.', 'error');
                      setVerticesPoligono(prev => prev.filter(v => v.id !== verticeSeleccionado)); setVerticeSeleccionado(null);
                    }}>Quitar vértice</button>
                  </div>}
                </div>
              ) : modoMapa === 'tolvas_silos' ? (
                <div className="space-y-4">
                  <h4 className="text-lg font-black text-violet-300">Cajones, silo y elementos</h4>
                  <p className="text-sm text-slate-400">Seleccioná una pieza del plano; arrastrá para moverla y usá el tirador amarillo para cambiar su tamaño.</p>
                  <div className="flex flex-wrap gap-2">{Object.entries(posicionCajones).map(([id, c]) =>
                    <button key={id} type="button" onClick={() => { setObjetoSeleccionadoPlano({ tipo: 'cajon', id });
                      if (c.visible === false) setPosicionCajones(prev => ({ ...prev, [id]: { ...prev[id], visible: true } })); }}
                      className="rounded-lg border border-slate-600 px-2 py-1 text-sm">{c.nombre}{c.visible === false ? ' · oculto' : ''}</button>)}</div>
                  <label className="block text-sm text-slate-400">Diámetro común de conos: {posicionSiloConos.diametroConos} px
                    <input type="range" min="24" max="55" value={posicionSiloConos.diametroConos}
                      onChange={e => { const d = Number(e.target.value); setPosicionSiloConos(prev => ({ ...prev, diametroConos: d }));
                        setPosicionConos(prev => Object.fromEntries(Object.entries(prev).map(([id, c]) => [id, { ...c, r: d / 2 }]))); }}
                      className="w-full accent-violet-400" /></label>
                  {objetoPlano && <div className="space-y-3 border-t border-slate-700 pt-3">
                    <strong className="text-cyan-300">{objetoSeleccionadoPlano.tipo === 'cono'
                      ? stockSilos.find(s => s.id === objetoSeleccionadoPlano.id)?.nombre
                      : objetoPlano.nombre ?? (objetoSeleccionadoPlano.tipo === 'nave' ? 'Nave de molienda' : 'Batería de silo')}</strong>
                    {['elemento', 'cajon'].includes(objetoSeleccionadoPlano.tipo) &&
                      <label className="block text-sm text-slate-400">Nombre
                        <input value={objetoPlano.nombre ?? ''} onChange={e => actualizarObjetoPlano('nombre', e.target.value)}
                          className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>}
                    {objetoSeleccionadoPlano.tipo === 'cono' &&
                      <label className="block text-sm text-slate-400">Nombre operativo
                        <input value={stockSilos.find(s => s.id === objetoSeleccionadoPlano.id)?.nombre ?? ''}
                          onChange={e => { const nuevo = e.target.value; const anterior = stockSilos.find(s => s.id === objetoSeleccionadoPlano.id)?.nombre;
                            setStockSilos(prev => prev.map(s => s.id === objetoSeleccionadoPlano.id ? { ...s, nombre: nuevo } : s));
                            setDestinosGenerales(prev => prev.map(d => clave(d.nombre) === clave(anterior) ? { ...d, nombre: nuevo } : d)); }}
                          className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>}
                    {objetoSeleccionadoPlano.tipo === 'cono' &&
                      <label className="block text-sm text-slate-400">Toneladas medidas
                        <input type="number" min="0" value={stockSilos.find(s => s.id === objetoSeleccionadoPlano.id)?.toneladas ?? 0}
                          onFocus={() => { const s = stockSilos.find(x => x.id === objetoSeleccionadoPlano.id);
                            inicioEdicionStockRef.current = { tipo: 'cono', id: s.id, nombre: s.nombre,
                              toneladas: numero(s.toneladas), metodo: 'Corrección directa de cono' }; }}
                          onBlur={() => { const ini = inicioEdicionStockRef.current; inicioEdicionStockRef.current = null;
                            if (ini) { const actual = dataRef.current.stockSilos.find(s => s.id === ini.id);
                              if (actual) registrarAjusteManual(actual.nombre, ini.toneladas, actual.toneladas, ini.metodo); } }}
                          onChange={e => setStockSilos(prev => prev.map(s => s.id === objetoSeleccionadoPlano.id
                            ? { ...s, toneladas: Math.max(0, numero(e.target.value)),
                              paladasOperativas: numero(s.toneladas) > 0 ? Math.round(numero(s.paladasOperativas) * Math.max(0, numero(e.target.value)) / numero(s.toneladas)) : 0 } : s))}
                          className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>}
                    <div className="grid grid-cols-2 gap-2">{['x', 'y', ...(objetoSeleccionadoPlano.tipo === 'cono' ? ['r'] : ['w', 'h'])].map(campo =>
                      <label key={campo} className="text-sm text-slate-400">{campo.toUpperCase()} (px)
                        <input type="number" value={objetoPlano[campo] ?? 0} min={campo === 'r' ? 12 : 0}
                          onChange={e => actualizarObjetoPlano(campo, Math.max(campo === 'r' ? 12 : 0, numero(e.target.value)))}
                          className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>)}</div>
                    {objetoSeleccionadoPlano.tipo === 'elemento' && <div className="flex items-center gap-3">
                      <select value={objetoPlano.forma} onChange={e => actualizarObjetoPlano('forma', e.target.value)}
                        className={`p-2 rounded-lg ${themeClasses.input}`}><option value="rectangulo">Rectángulo</option><option value="elipse">Elipse</option></select>
                      <input type="color" value={objetoPlano.color} onChange={e => actualizarObjetoPlano('color', e.target.value)} aria-label="Color del elemento" />
                      <button type="button" className="text-red-300 underline text-sm" onClick={() => {
                        setElementosMapa(prev => prev.filter(a => a.id !== objetoSeleccionadoPlano.id)); setObjetoSeleccionadoPlano(null);
                      }}>Quitar</button></div>}
                    {objetoSeleccionadoPlano.tipo === 'cajon' && <button type="button" className="text-red-300 underline text-sm"
                      onClick={() => { actualizarObjetoPlano('visible', false); setObjetoSeleccionadoPlano(null); }}>
                      Quitar del plano (conservar datos operativos)</button>}
                    {objetoSeleccionadoPlano.tipo === 'cono' && <button type="button" className="text-red-300 underline text-sm"
                      onClick={() => { const cono = stockSilos.find(s => s.id === objetoSeleccionadoPlano.id);
                        if (numero(cono?.toneladas) > 0) return showToast('Conciliá el stock del cono antes de quitarlo.', 'error');
                        setStockSilos(prev => prev.map(s => s.id === cono.id ? { ...s, activo: false } : s));
                        setObjetoSeleccionadoPlano(null); }}>
                      Desactivar cono vacío</button>}
                  </div>}
                  {stockSilos.some(s => !s.activo) && <div className="space-y-1"><p className="text-sm text-slate-400">Conos inactivos</p>
                    {stockSilos.filter(s => !s.activo).map(s => <button key={s.id} type="button"
                      onClick={() => setStockSilos(prev => prev.map(a => a.id === s.id ? { ...a, activo: true } : a))}
                      className="block text-sm text-cyan-300 underline">Restaurar {s.nombre}</button>)}</div>}
                </div>
              ) : acopioSeleccionadoPlano ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                    <div className="flex-1 pr-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">Editar Acopio</span>
                      <input
                        type="text"
                        value={acopioSeleccionadoPlano.nombre}
                        onChange={(e) => {
                          const nuevoNombre = e.target.value;
                          setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, nombre: nuevoNombre } : a));
                          setAcopioSeleccionadoPlano(prev => ({ ...prev, nombre: nuevoNombre }));
                        }}
                        className={`font-black text-lg w-full mt-0.5 rounded-lg p-1.5 ${themeClasses.input}`}
                        placeholder="Nombre del Acopio"
                      />
                      <select
                        value={acopioSeleccionadoPlano.sector}
                        onChange={(e) => {
                          const nuevoSec = e.target.value;
                          setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, sector: nuevoSec } : a));
                          setAcopioSeleccionadoPlano(prev => ({ ...prev, sector: nuevoSec }));
                        }}
                        className={`text-xs font-bold mt-2 w-full p-2 rounded-lg ${themeClasses.input}`}
                      >
                        {sectoresVirtuales.map(s => <option key={s.id} value={s.nombre} className="text-slate-900">{s.nombre}</option>)}
                      </select>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 whitespace-nowrap">
                      {acopioSeleccionadoPlano.pisos}P
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm text-slate-400">Forma en el plano
                      <select value={acopioSeleccionadoPlano.forma ?? 'elipse'}
                        onChange={e => { const forma = e.target.value;
                          setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, forma } : a)); }}
                        className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`}>
                        <option value="elipse">Elipse</option><option value="rectangulo">Rectángulo</option><option value="triangulo">Triángulo</option>
                      </select>
                    </label>
                    <button type="button" className="self-end rounded-lg border border-red-500/40 p-2 text-red-300 text-sm font-bold"
                      onClick={() => {
                        if (numero(acopioSeleccionadoPlano.toneladas) > 0)
                          return showToast('Para quitar un acopio, conciliá primero sus toneladas.', 'error');
                        if (plan.camiones.some(c => clave(c.destino) === clave(acopioSeleccionadoPlano.nombre)))
                          return showToast('El acopio figura como destino en el plan. Cambiá esos camiones antes de quitarlo.', 'error');
                        setStockPlaya(prev => prev.filter(a => a.id !== acopioSeleccionadoPlano.id));
                        setAcopioSeleccionadoPlano(null);
                      }}>Quitar acopio vacío</button>
                  </div>

                  {/* Triángulo de Proporciones de Componentes (Arcilla, Arena y Limo) */}
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <Icons.Layers /> <span>Triángulo Textural de la Tierra</span>
                      </span>
                      <span className="text-xs font-bold text-slate-400">Total: {['arcilla', 'arena', 'limo'].reduce((s, k) => s + numero(acopioSeleccionadoPlano.textura?.[k]), 0)}%</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-emerald-400">Arcilla (Buena / Plástica):</span>
                          <span className="font-mono font-black text-white">{acopioSeleccionadoPlano.textura?.arcilla ?? 60}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acopioSeleccionadoPlano.textura?.arcilla ?? 60}
                          onChange={(e) => actualizarTexturaAcopio(acopioSeleccionadoPlano.id, 'arcilla', e.target.value)}
                          className="w-full accent-emerald-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-red-400">Arena (Mala / Abrasiva):</span>
                          <span className="font-mono font-black text-white">{acopioSeleccionadoPlano.textura?.arena ?? 20}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acopioSeleccionadoPlano.textura?.arena ?? 20}
                          onChange={(e) => actualizarTexturaAcopio(acopioSeleccionadoPlano.id, 'arena', e.target.value)}
                          className="w-full accent-red-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-amber-400">Limo (Inerte / Intermedio):</span>
                          <span className="font-mono font-black text-white">{acopioSeleccionadoPlano.textura?.limo ?? 20}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acopioSeleccionadoPlano.textura?.limo ?? 20}
                          onChange={(e) => actualizarTexturaAcopio(acopioSeleccionadoPlano.id, 'limo', e.target.value)}
                          className="w-full accent-amber-400 cursor-pointer"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">Al modificar un componente, los otros dos se redistribuyen y el total se mantiene en 100%.</p>
                  </div>

                  {/* La humedad conserva H0-H3 para el modelo de densidad. */}
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Icons.Database /> <span>Propiedades / Calidad (0 a {escalaCalidad}; humedad H0-H3)</span>
                      </span>
                    </div>

                    <div className="space-y-2">
                      {caracteristicasTierra.filter(c => c.activo).map((car) => {
                        const puntaje = (acopioSeleccionadoPlano.calidades || {})[car.nombre] !== undefined
                          ? acopioSeleccionadoPlano.calidades[car.nombre]
                          : 0;

                        return (
                          <div key={car.id} className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-300 w-28 truncate">{car.nombre}:</span>
                            <div className="flex flex-wrap justify-end items-center gap-1">
                              {Array.from({ length: car.nombre === 'Humedad' ? 4 : escalaCalidad + 1 }, (_, v) => v).map(v => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => actualizarCalidadAcopio(acopioSeleccionadoPlano.id, car.nombre, v)}
                                  className={`w-6 h-6 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                                    puntaje === v
                                      ? v === 0 ? 'bg-slate-700 text-white border-slate-500'
                                        : v === 1 ? 'bg-blue-600 text-white border-blue-400'
                                        : v === 2 ? 'bg-amber-600 text-white border-amber-400'
                                        : 'bg-red-600 text-white border-red-400'
                                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nivel de Pisos y Tamaño / Talud */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        Nivel de Pisos / Altura de Estiba:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map(nivel => (
                          <button
                            key={nivel}
                            type="button"
                            onClick={() => modificarPisosEnAcopioPlano(acopioSeleccionadoPlano.id, nivel)}
                            className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                              (acopioSeleccionadoPlano.pisos || 1) === nivel
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                                : `${themeClasses.cardSecondary} hover:bg-slate-700`
                            }`}
                          >
                            {nivel} {nivel === 1 ? 'Piso' : 'Pisos'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 mb-1">
                          <span>Ancho Talud:</span>
                          <span className="text-cyan-400 font-mono">{acopioSeleccionadoPlano.radioBase || 32} px</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="55"
                          value={acopioSeleccionadoPlano.radioBase || 32}
                          onChange={(e) => {
                            const r = Number(e.target.value);
                            setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, radioBase: r } : a));
                            setAcopioSeleccionadoPlano(prev => ({ ...prev, radioBase: r }));
                          }}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 mb-1">
                          <span>Largo Eje:</span>
                          <span className="text-cyan-400 font-mono">{acopioSeleccionadoPlano.largoEje || 44} px</span>
                        </div>
                        <input
                          type="range"
                          min="24"
                          max="70"
                          value={acopioSeleccionadoPlano.largoEje || 44}
                          onChange={(e) => {
                            const l = Number(e.target.value);
                            setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, largoEje: l } : a));
                            setAcopioSeleccionadoPlano(prev => ({ ...prev, largoEje: l }));
                          }}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Configuración Directa de Paladas y Toneladas */}
                  <div className={`${themeClasses.cardSecondary} p-4 rounded-2xl border space-y-4`}>
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 block">
                      Ajuste Directo de Stock:
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Paladas Totales</label>
                        <input
                          type="number"
                          min="0"
                          value={acopioSeleccionadoPlano.paladas || 0}
                          onFocus={() => { inicioEdicionStockRef.current = { id: acopioSeleccionadoPlano.id,
                            toneladas: numero(acopioSeleccionadoPlano.toneladas), metodo: 'Corrección directa por paladas' }; }}
                          onBlur={finalizarEdicionStock}
                          onChange={(e) => {
                            const pal = Math.max(0, Math.round(Number(e.target.value) || 0));
                            const m3 = pal * 3.0;
                            const ton = calcularM3aTon(m3, acopioSeleccionadoPlano);
                            setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, paladas: pal, m3Estimados: m3, toneladas: ton } : a));
                            setAcopioSeleccionadoPlano(prev => ({ ...prev, paladas: pal, m3Estimados: m3, toneladas: ton }));
                          }}
                          className={`w-full p-2 rounded-xl font-black text-center text-sm ${themeClasses.input}`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Toneladas Totales</label>
                        <input
                          type="number"
                          min="0"
                          value={acopioSeleccionadoPlano.toneladas || 0}
                          onFocus={() => { inicioEdicionStockRef.current = { id: acopioSeleccionadoPlano.id,
                            toneladas: numero(acopioSeleccionadoPlano.toneladas), metodo: 'Corrección directa en toneladas' }; }}
                          onBlur={finalizarEdicionStock}
                          onChange={(e) => {
                            const ton = Math.max(0, Number(e.target.value) || 0);
                            const m3 = calcularTonaM3(ton, acopioSeleccionadoPlano);
                            const pal = Math.round(m3 / 3.0);
                            setStockPlaya(prev => prev.map(a => a.id === acopioSeleccionadoPlano.id ? { ...a, toneladas: ton, m3Estimados: m3, paladas: pal } : a));
                            setAcopioSeleccionadoPlano(prev => ({ ...prev, toneladas: ton, m3Estimados: m3, paladas: pal }));
                          }}
                          className={`w-full p-2 rounded-xl font-black text-center text-sm text-cyan-400 ${themeClasses.input}`}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-700 flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={deltaPaladasInput}
                        onChange={(e) => setDeltaPaladasInput(Math.max(1, Number(e.target.value) || 1))}
                        className={`w-16 p-1.5 rounded-lg text-center font-black text-xs ${themeClasses.input}`}
                      />
                      <button
                        type="button"
                        onClick={() => aplicarDeltaManual(1)}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg cursor-pointer"
                      >
                        + Sumar
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarDeltaManual(-1)}
                        className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-lg cursor-pointer"
                      >
                        - Restar
                      </button>
                    </div>
                  </div>
                  <div className={`${themeClasses.cardSecondary} p-4 rounded-2xl border space-y-2`}>
                    <h5 className="text-[10px] font-black uppercase text-slate-400">Últimos ajustes manuales</h5>
                    {ajustesManuales.filter(a => a.nombre === acopioSeleccionadoPlano.nombre).slice(0, 5).map(a =>
                      <p key={a.id} className="text-[11px] text-slate-400">
                        {new Date(a.fecha).toLocaleString('es-AR')} · {a.antesTon} → {a.despuesTon} t · {a.metodo}
                      </p>)}
                    {!ajustesManuales.some(a => a.nombre === acopioSeleccionadoPlano.nombre) &&
                      <p className="text-[11px] text-slate-500">Aún no hay correcciones registradas.</p>}
                  </div>
                </div>
              ) : sectorSeleccionadoPlano ? (
                <div className="space-y-4">
                  <h4 className="text-base font-black text-white">Editar Sector Virtual</h4>
                  <input
                    type="text"
                    value={sectorSeleccionadoPlano.nombre}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSectoresVirtuales(prev => prev.map(s => s.id === sectorSeleccionadoPlano.id ? { ...s, nombre: val } : s));
                      setSectorSeleccionadoPlano(prev => ({ ...prev, nombre: val }));
                    }}
                    className={`w-full p-2 rounded-xl text-sm font-bold ${themeClasses.input}`}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm text-slate-400">Forma
                      <select value={sectorSeleccionadoPlano.forma ?? 'rectangulo'}
                        onChange={e => setSectoresVirtuales(prev => prev.map(s => s.id === sectorSeleccionadoPlano.id
                          ? { ...s, forma: e.target.value } : s))}
                        className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`}>
                        <option value="rectangulo">Rectángulo</option><option value="elipse">Elipse</option>
                      </select></label>
                    <label className="text-sm text-slate-400">Color
                      <input type="color" value={sectorSeleccionadoPlano.color ?? '#14b8a6'}
                        onChange={e => setSectoresVirtuales(prev => prev.map(s => s.id === sectorSeleccionadoPlano.id
                          ? { ...s, color: e.target.value } : s))}
                        className="mt-1 h-10 w-full rounded-lg" /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-black">Ancho (px)</label>
                      <input
                        type="number"
                        value={sectorSeleccionadoPlano.w}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          setSectoresVirtuales(prev => prev.map(s => s.id === sectorSeleccionadoPlano.id ? { ...s, w } : s));
                          setSectorSeleccionadoPlano(prev => ({ ...prev, w }));
                        }}
                        className={`w-full p-2 rounded-xl ${themeClasses.input}`}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-black">Alto (px)</label>
                      <input
                        type="number"
                        value={sectorSeleccionadoPlano.h}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          setSectoresVirtuales(prev => prev.map(s => s.id === sectorSeleccionadoPlano.id ? { ...s, h } : s));
                          setSectorSeleccionadoPlano(prev => ({ ...prev, h }));
                        }}
                        className={`w-full p-2 rounded-xl ${themeClasses.input}`}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSectoresVirtuales(prev => prev.filter(s => s.id !== sectorSeleccionadoPlano.id));
                      setSectorSeleccionadoPlano(null);
                      showToast("Sector virtual eliminado.");
                    }}
                    className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Eliminar este Sector
                  </button>
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Icons.Map />
                  </div>
                  <p className="text-xs font-bold">Seleccione un acopio o sector del plano para ver sus detalles y propiedades.</p>
                </div>
              )}

              {editar && <div className="pt-4 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setVerticesPoligono(VERTICES_POLIGONO_CALIBRADOS);
                    setSectoresVirtuales(SECTORES_VIRTUALES_INICIALES);
                    setPosicionNaveMolienda({ x: 50, y: 220, w: 220, h: 125 });
                    setPosicionSiloConos({ x: 300, y: 350, w: 230, h: 80, diametroConos: 38 });
                    setPosicionCajones(CAJONES_INICIALES);
                    setPosicionConos(CONOS_INICIALES);
                    showToast("Calibración satelital original restaurada.");
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider"
                >
                  Restaurar Calibración Satelital Original
                </button>
              </div>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHistorico = () => <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8`}>
    <div className="max-w-7xl mx-auto space-y-5">
      <header className={`${themeClasses.card} border rounded-3xl p-6 flex flex-wrap justify-between gap-3`}>
        <div><h2 className="text-2xl font-black">Novedades y producción histórica</h2>
          <p className="text-sm text-slate-400">Consulta de la planilla histórica de Molienda, Silo y producción, en páginas de hasta 100 registros.</p></div>
        <div className="flex gap-2"><a href={SHEET_HISTORICA_URL} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border border-cyan-500 text-cyan-300 text-sm">Abrir hoja original</a>
          <button onClick={() => setCurrentView('dashboard')} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm">Volver</button></div>
      </header>
      <section className={`${themeClasses.card} border rounded-3xl p-5 space-y-4`}>
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" className={`rounded-lg px-3 py-2 border ${historicoFuente === 'csv' ? 'border-cyan-400 text-cyan-200' : 'border-slate-600'}`}
              onClick={() => { setHistoricoFuente('csv'); setHistoricoOffset(0); setHistoricoGid(1381238472); }}>CSV publicado</button>
            {appsScriptUrl && appsScriptUrl !== 'URL_AQUI' && <button type="button"
              className={`rounded-lg px-3 py-2 border ${historicoFuente === 'sheets' ? 'border-cyan-400 text-cyan-200' : 'border-slate-600'}`}
              onClick={() => { setHistoricoFuente('sheets'); setHistoricoOffset(0); }}>Otras pestañas vía Apps Script</button>}
          </div>
          <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-bold">Pestaña
            <select value={historicoGid} onChange={e => { setHistoricoGid(Number(e.target.value)); setHistoricoOffset(0); }}
              className={`ml-2 p-2 rounded-lg ${themeClasses.input}`}>
              {(historicoSheet?.tabs ?? [{ gid: 1381238472, nombre: 'Pestaña enlazada' }]).map(t =>
                <option key={t.gid} value={t.gid}>{t.nombre} ({t.filas ?? '—'} filas)</option>)}
            </select></label>
            <span className="text-sm text-slate-400">{cargandoHistorico ? 'Consultando…' : historicoSheet?.filas?.length ?
              `${historicoSheet.filas.length} filas · ${historicoSheet.totalFilas ?? '?'} registros en la pestaña` : 'Sin filas'}</span>
          </div>
          {historicoSheet?.error && <p role="alert" className="text-red-300 text-sm">{historicoSheet.error}</p>}
          <div className="overflow-auto max-h-[65vh] rounded-xl border border-slate-700">
            <table className="min-w-full text-sm border-collapse"><thead className="sticky top-0 bg-slate-800 text-cyan-200"><tr>
              {(historicoSheet?.encabezados ?? []).map((h, i) => <th key={i} className="p-2 text-left whitespace-nowrap border-b border-slate-600">{h || `Columna ${i + 1}`}</th>)}</tr></thead>
              <tbody>{(historicoSheet?.filas ?? []).map((row, i) => <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                {row.map((v, j) => <td key={j} className="p-2 max-w-80 truncate" title={String(v)}>{String(v)}</td>)}</tr>)}</tbody></table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Página {Math.floor(historicoOffset / 100) + 1} · registros más recientes primero</span>
            <div className="flex gap-2">
              <button type="button" disabled={cargandoHistorico || historicoOffset === 0}
                onClick={() => setHistoricoOffset(x => Math.max(0, x - 100))}
                className="rounded-lg border border-slate-600 px-3 py-2">Más recientes</button>
              <button type="button" disabled={cargandoHistorico || !historicoSheet?.hayMas}
                onClick={() => setHistoricoOffset(x => x + 100)}
                className="rounded-lg border border-slate-600 px-3 py-2">Más antiguos</button>
            </div>
          </div>
          <p className="text-xs text-slate-500">Solo lectura; los encabezados se muestran tal como están en la hoja original.</p>
        </section>
    </div>
  </div>;

  const renderDatosValidados = () => <main className={`min-h-screen ${themeClasses.bg} p-4 md:p-8`}>
    <div className="max-w-6xl mx-auto space-y-5">
      <header className={`${themeClasses.card} border rounded-2xl p-6`}><p className="text-xs uppercase tracking-wider text-cyan-300">Reportes SG Molienda</p>
        <h2 className="text-2xl font-bold">Datos validados de planta</h2>
        <p className="text-sm text-slate-400">{estadoSheet.estado === 'conectado' ? `Planilla conectada · revisión ${estadoSheet.revision}` : `Copia validada del 24/09/2026 · ${estadoSheet.mensaje ?? 'sin sincronización en vivo'}`}.</p>
        <div className="mt-3 flex gap-3 items-center"><button type="button" onClick={cargarEstadoSheet} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Actualizar desde la planilla</button>
          <a href={SHEET_PRINCIPAL_URL} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 underline">Abrir planilla</a></div></header>
      <div className="grid gap-4 sm:grid-cols-3">{[['Operarios', operadores.length], ['Máquinas', maquinas.length], ['Turnos registrados', turnosValidados === null ? 'Sin conexión' : turnosValidados]].map(([nombre, valor]) =>
        <div key={nombre} className={`${themeClasses.card} border rounded-2xl p-5`}><p className="text-sm text-slate-400">{nombre}</p><strong className="text-2xl">{valor}</strong></div>)}</div>
      {turnosValidados === 0 && <p className="rounded-xl border border-amber-500/40 p-4 text-sm text-amber-200">La pestaña Turnos tiene encabezados, pero aún no registra jornadas. Los datos históricos se consultan en Histórico.</p>}
      <div className="grid gap-4 lg:grid-cols-2"><section className={`${themeClasses.card} border rounded-2xl p-5`}><h3 className="font-bold mb-3">Personal habilitado</h3>
        <div className="max-h-96 overflow-auto space-y-1">{operadores.map(o => <div key={o.id} className="flex justify-between gap-3 border-b border-slate-700/50 py-2 text-sm"><span>{o.nombre}</span><span className="text-slate-400 text-right">{o.puestosHabilitados?.join(', ') || 'Sin puesto'}</span></div>)}</div></section>
        <section className={`${themeClasses.card} border rounded-2xl p-5`}><h3 className="font-bold mb-3">Máquinas y baldes</h3>
          {maquinas.map(m => <div key={m.id} className="flex justify-between border-b border-slate-700/50 py-2 text-sm"><span>{m.nombre}</span><span>{m.m3PorPalada} m³/palada</span></div>)}
          <h3 className="font-bold mt-5 mb-2">Orígenes y sectores</h3><p className="text-sm text-slate-400">{canteras.map(c => c.nombre).join(' · ')}</p>
          <p className="mt-2 text-sm text-slate-400">{sectores.map(s => `${s.cuadrante}: ${s.nombre}`).join(' · ')}</p></section></div>
    </div></main>;

  const renderConciliacion = () => {
    const lista = ajustePropuesto.tipo === 'cono' ? stockSilos : stockPlaya;
    const referencia = ajustePropuesto.tipo === 'cono' ? stockValidadoSheet?.conos : stockValidadoSheet?.acopios;
    const elegido = lista.find(s => String(s.id) === String(ajustePropuesto.id));
    const base = referencia?.find(s => String(s.id) === String(ajustePropuesto.id));
    const medido = ajustePropuesto.toneladas === '' ? null : Number(ajustePropuesto.toneladas);
    const delta = medido === null || !Number.isFinite(medido) || !base ? null : redondear(medido - numero(base.toneladas));
    return <main className={`min-h-screen ${themeClasses.bg} p-4 md:p-8`}><div className="max-w-5xl mx-auto space-y-5">
      <header className={`${themeClasses.card} border rounded-2xl p-6`}><p className="text-xs uppercase tracking-wide text-cyan-300">Control de inventario</p>
        <h2 className="text-2xl font-bold">Conciliación de acopios y conos</h2><p className="text-sm text-slate-400">Compará el saldo registrado en la planilla con una medición física antes de corregirlo. Cada ajuste guarda motivo, responsable y diferencia.</p>
        <p className="text-sm mt-2">{estadoSheet.estado === 'conectado' ? `Conectado · revisión ${estadoSheet.revision}` : `Sin conexión: ${estadoSheet.mensaje ?? 'revisá la integración'}`}</p>
        <button type="button" onClick={cargarEstadoSheet} className="mt-3 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm">Actualizar saldos validados</button></header>
      <div className="grid gap-5 lg:grid-cols-2"><section className={`${themeClasses.card} border rounded-2xl p-5 space-y-3`}><h3 className="font-bold">Registrar medición</h3>
        <label className="block text-sm">Ubicación<select className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} value={ajustePropuesto.tipo} onChange={e => setAjustePropuesto(p => ({ ...p, tipo: e.target.value, id: '', toneladas: '' }))}><option value="acopio">Acopio en playa</option><option value="cono">Cono de silo</option></select></label>
        <label className="block text-sm">Elemento<select className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} value={ajustePropuesto.id} onChange={e => setAjustePropuesto(p => ({ ...p, id: e.target.value, toneladas: '' }))}><option value="">Elegir elemento</option>{lista.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
        <div className="grid grid-cols-3 gap-2 text-sm">{[['Registrado', base ? `${redondear(base.toneladas)} t` : '—'], ['Medido', medido !== null && Number.isFinite(medido) ? `${medido} t` : '—'], ['Diferencia', delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta} t`]].map(([a,b]) => <div key={a} className="rounded-lg bg-slate-800/70 p-3"><span className="block text-slate-400">{a}</span><strong>{b}</strong></div>)}</div>
        {elegido && base && Math.abs(numero(elegido.toneladas) - numero(base.toneladas)) > .001 && <p className="text-sm text-amber-300">Este navegador muestra {redondear(elegido.toneladas)} t; la planilla registra {redondear(base.toneladas)} t. Actualizá los saldos antes de aplicar.</p>}
        <label className="block text-sm">Toneladas medidas<input type="number" min="0" step="0.01" value={ajustePropuesto.toneladas} onChange={e => setAjustePropuesto(p => ({ ...p, toneladas: e.target.value }))} className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>
        <label className="block text-sm">Motivo de la diferencia<textarea maxLength="500" value={ajustePropuesto.motivo} onChange={e => setAjustePropuesto(p => ({ ...p, motivo: e.target.value }))} className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>
        <label className="block text-sm">Responsable<input value={ajustePropuesto.responsable} maxLength="120" onChange={e => setAjustePropuesto(p => ({ ...p, responsable: e.target.value }))} className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} /></label>
        <button type="button" disabled={guardandoAjuste || estadoSheet.estado !== 'conectado' || !base || medido === null || !Number.isFinite(medido) || medido < 0 || delta === 0 || ajustePropuesto.motivo.trim().length < 5 || !ajustePropuesto.responsable.trim()}
          onClick={async () => { setGuardandoAjuste(true); try { const idAjuste = nuevoId(); const resultado = await consultarAppsScript('adjustStock', { payload: { action: 'adjustStock', idAjuste, expectedEtag: estadoSheet.etag,
            tipo: ajustePropuesto.tipo, id: ajustePropuesto.id, toneladas: medido, motivo: ajustePropuesto.motivo.trim(), responsable: ajustePropuesto.responsable.trim() } });
            setAjustesManuales(prev => [{ id: idAjuste, fecha: new Date().toISOString(), tipo: ajustePropuesto.tipo,
              nombre: base.nombre, antesTon: resultado.antesTon, despuesTon: resultado.despuesTon,
              metodo: ajustePropuesto.motivo.trim(), responsable: ajustePropuesto.responsable.trim(), origen: 'Google Sheets' }, ...prev]);
            setAjustePropuesto(p => ({ ...p, toneladas: '', motivo: '' })); await cargarEstadoSheet(); showToast('Ajuste registrado y stock actualizado en la planilla.');
          } catch (error) { showToast(error.message, 'error'); await cargarEstadoSheet(); } finally { setGuardandoAjuste(false); } }}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold disabled:opacity-40">{guardandoAjuste ? 'Registrando…' : 'Confirmar ajuste en Google Sheets'}</button></section>
        <section className={`${themeClasses.card} border rounded-2xl p-5`}><h3 className="font-bold mb-3">Saldos de referencia</h3>
          <div className="max-h-96 overflow-auto text-sm">{[['Acopios', stockValidadoSheet?.acopios], ['Conos', stockValidadoSheet?.conos]].map(([title, items]) => <div key={title}><h4 className="text-cyan-300 font-semibold mt-3">{title}</h4>{(items ?? []).map(s => <div key={s.id} className="flex justify-between border-b border-slate-700/50 py-2"><span>{s.nombre}</span><strong>{redondear(s.toneladas)} t</strong></div>)}</div>)}</div>
          <h3 className="font-bold mt-6 mb-2">Ajustes recientes</h3><div className="max-h-64 overflow-auto space-y-2 text-sm">{ajustesManuales.slice(0, 15).map(a => <p key={a.id} className="border-b border-slate-700/50 pb-2"><strong>{a.nombre}</strong> · {a.antesTon} → {a.despuesTon} t<br/><span className="text-slate-400">{a.metodo}{a.responsable ? ` · ${a.responsable}` : ''} · {a.origen ?? 'Local'}</span></p>)}{!ajustesManuales.length && <p className="text-slate-400">Sin ajustes registrados.</p>}</div></section></div>
    </div></main>;
  };

  const renderBalanceSilos = () => {
    const total = redondear(stockSilos.reduce((n, s) => n + numero(s.toneladas), 0));
    const max = Math.max(1, ...stockSilos.map(s => numero(s.toneladas)));
    const cierres = [...historialReportes].filter(r => Array.isArray(r.balanceSilos)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-7);
    const serie = cierres.map(r => ({ fecha: r.fecha, toneladas: redondear(r.balanceSilos.reduce((n, s) => n + numero(s.finalTon), 0)) }));
    const mayor = Math.max(1, ...serie.map(x => x.toneladas));
    const puntos = serie.map((x, i) => `${30 + i * (580 / Math.max(1, serie.length - 1))},${155 - x.toneladas / mayor * 125}`).join(' ');
    const movimientos = historialReportes.flatMap(r => (r.payload?.Movimientos ?? []).map(m => ({ ...m, fecha: r.fecha }))).slice(0, 12);
    return <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8`}>
      <div className="max-w-6xl mx-auto space-y-6">
        <header className={`${themeClasses.card} border rounded-3xl p-6 flex flex-wrap justify-between gap-3`}>
          <div><span className="text-sm text-cyan-300 font-bold uppercase">Inventario de tierra · Cevil Pozo</span>
            <h2 className="text-3xl font-black">Balance de conos del silo</h2>
            <p className="text-sm text-slate-400">Entradas y salidas de los movimientos auditados, con actualización al cerrar cada jornada.</p></div>
          <button onClick={() => setCurrentView('dashboard')} className="rounded-xl bg-slate-800 text-white px-4 py-2 h-fit">Volver al panel</button>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[['Conos disponibles', conosValidados ? total : '—', conosValidados ? 't' : ''], ['Cajón 2 · por distribuir', redondear(stockCajon2), 't'],
            ['Conos activos', stockSilos.filter(s => s.activo).length, '']].map(([etiqueta, valor, unidad]) =>
            <div key={etiqueta} className={`${themeClasses.card} border rounded-2xl p-5`}><p className="text-sm text-slate-400">{etiqueta}</p>
              <strong className="text-3xl text-cyan-300">{valor} {unidad}</strong></div>)}
        </div>
        {!conosValidados && <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm space-y-3">
          <p><strong>Saldo inicial pendiente.</strong> Editá las toneladas medidas de cada cono desde el plano. Un cero debe ser un valor medido, no una suposición. Confirmá para registrar la línea de base en la planilla.</p>
          <button type="button" disabled={!estadoSheet.etag || !appsScriptUrl || appsScriptUrl === 'URL_AQUI'}
            onClick={async () => { try { const result = await consultarAppsScript('initializeCones', { payload: {
              action: 'initializeCones', expectedEtag: estadoSheet.etag,
              conos: stockSilos.filter(x => x.activo).map(x => ({ id: x.id, nombre: x.nombre,
                toneladas: numero(x.toneladas), humedadNivel: nivelHumedad(x.humedadNivel ?? 1),
                paladasOperativas: numero(x.paladasOperativas) })) } });
              setConosValidados(true); setEstadoSheet(prev => ({ ...prev, etag: result.etag, aplicado: true }));
              showToast('Saldos iniciales registrados en la planilla.');
            } catch (error) { showToast(error.message, 'error'); } }}
            className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 font-bold disabled:opacity-40">Confirmar saldos medidos en Google Sheets</button>
          {(!appsScriptUrl || appsScriptUrl === 'URL_AQUI') && <p>Para confirmar, desplegá el puente Apps Script y pegá su URL en Configuración.</p>}
        </div>}
        <p className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-sm">El consumo de producción se descuenta cuando se audita un movimiento de un cono a Cajón 3. La planilla histórica puede consultarse por separado; todavía no se asignan automáticamente sus toneladas a conos porque no se pudo verificar la estructura de esas pestañas.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className={`${themeClasses.card} border rounded-3xl p-6 space-y-5`}>
            <h3 className="text-xl font-black">Existencia por cono</h3>
            {stockSilos.map(s => { const ultimo = [...cierres].reverse().find(r => r.balanceSilos.some(x => clave(x.nombre) === clave(s.nombre)))?.balanceSilos.find(x => clave(x.nombre) === clave(s.nombre));
              const entradas7 = redondear(cierres.reduce((n, r) => n + numero(r.balanceSilos.find(x => clave(x.nombre) === clave(s.nombre))?.entradasTon), 0));
              const salidas7 = redondear(cierres.reduce((n, r) => n + numero(r.balanceSilos.find(x => clave(x.nombre) === clave(s.nombre))?.salidasTon), 0));
              return <div key={s.id} className="space-y-1.5">
                <div className="flex justify-between text-sm"><strong>{s.nombre}{!s.activo ? ' · inactivo' : ''}</strong><strong>{conosValidados ? `${redondear(s.toneladas)} t` : 'Sin validar'}</strong></div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden" role="img" aria-label={`${s.nombre}: ${redondear(s.toneladas)} toneladas`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" style={{ width: `${Math.max(0, numero(s.toneladas) / max * 100)}%` }} /></div>
                <p className="text-xs text-slate-400">Últimos {cierres.length} cierres: +{entradas7} t · −{salidas7} t{ultimo ? ` · último cierre ${ultimo.antesTon} → ${ultimo.finalTon} t` : ''}</p>
              </div>;
            })}
          </section>
          <section className={`${themeClasses.card} border rounded-3xl p-6 space-y-3`}>
            <h3 className="text-xl font-black">Evolución en cierres</h3>
            {serie.length ? <><svg viewBox="0 0 640 180" className="w-full h-48" role="img" aria-label="Toneladas totales disponibles en los últimos cierres">
              <line x1="30" y1="155" x2="610" y2="155" stroke="#64748b" />
              <polyline points={puntos} fill="none" stroke="#2dd4bf" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {serie.map((x, i) => <circle key={x.fecha} cx={30 + i * (580 / Math.max(1, serie.length - 1))} cy={155 - x.toneladas / mayor * 125} r="5" fill="#fbbf24" />)}
            </svg><div className="flex flex-wrap gap-2 text-sm text-slate-400">{serie.map(x => <span key={x.fecha} className="rounded-lg bg-slate-800 px-2 py-1">{x.fecha}: {x.toneladas} t</span>)}</div></>
              : <p className="text-sm text-slate-400">La serie aparecerá al cerrar la primera jornada auditada.</p>}
            <p className="text-xs text-slate-500">Tendencia entre cierres registrados; no interpola consumos sin auditar.</p>
          </section>
        </div>
        <section className={`${themeClasses.card} border rounded-3xl p-6 overflow-x-auto`}>
          <h3 className="text-xl font-black mb-3">Últimos movimientos registrados</h3>
          {movimientos.length ? <table className="w-full text-sm"><thead><tr className="text-left text-slate-400 border-b border-slate-700">
            {['Fecha', 'Origen', 'Destino', 'Paladas', 'Toneladas'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
            {movimientos.map((m, i) => <tr key={`${m.fecha}-${m.id ?? i}`} className="border-b border-slate-800"><td className="p-2">{m.fecha}</td>
              <td className="p-2">{m.origen}</td><td className="p-2">{m.destino}</td><td className="p-2">{m.cantPaladas}</td>
              <td className="p-2">{m.toneladasEstimadas ?? '—'}</td></tr>)}</tbody></table>
            : <p className="text-sm text-slate-400">Todavía no hay movimientos cerrados.</p>}
        </section>
      </div>
    </div>;
  };

  const consultarAsistente = async () => {
    if (!consultaAyuda.trim() || ayudaOcupada) return;
    setAyudaOcupada(true); setRespuestaAyuda(null);
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: consultaAyuda, ensenanzas: comentariosMejora.filter(c => c.tipo === 'enseñanza').map(c => c.texto) }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'No se pudo consultar la ayuda.');
      setRespuestaAyuda(result);
    } catch (error) { showToast(error.message, 'error'); }
    finally { setAyudaOcupada(false); }
  };

  const renderAsistente = () => <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8`}><div className="max-w-4xl mx-auto space-y-5">
    <header className="flex justify-between gap-3"><div><h2 className="text-2xl font-black">Ayuda y mejoras</h2>
      <p className="text-sm text-slate-400">Consultá cómo usar el sistema y revisá cada acción sugerida antes de aplicarla.</p></div>
      <button className="text-sm underline" onClick={() => setCurrentView('dashboard')}>Volver al panel</button></header>
    <section className={`${themeClasses.card} border rounded-2xl p-5 space-y-3`}><h3 className="font-bold">Guía rápida</h3>
      <ul className="text-sm text-slate-300 space-y-1"><li>Planificación: asigná turnos, tareas, nuevos acopios, camiones e indicaciones.</li>
        <li>Plano: consultá la ubicación. Desbloqueá con PIN para editar límites, acopios, cajones y conos.</li>
        <li>Auditoría: verificá asistencia, tareas, ingresos, paladas y paradas antes del cierre.</li>
        <li>Silos: conciliá mediciones y balance; Pizarrón: programá avisos y registrá tareas realizadas.</li></ul></section>
    <section className={`${themeClasses.card} border rounded-2xl p-5 space-y-3`}><h3 className="font-bold">Consultar a la IA</h3>
      <textarea rows={3} value={consultaAyuda} maxLength={2000} onChange={e => setConsultaAyuda(e.target.value)}
        placeholder="Ejemplo: ¿cómo registro una descarga o planifico un acopio?" className={`w-full p-3 rounded-xl ${themeClasses.input}`} />
      <button disabled={ayudaOcupada || !consultaAyuda.trim()} onClick={consultarAsistente} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold">
        {ayudaOcupada ? 'Preparando respuesta…' : 'Consultar'}</button>
      {respuestaAyuda && <div className="border border-cyan-500/40 rounded-xl p-4 space-y-3" role="status"><p className="whitespace-pre-wrap text-sm">{respuestaAyuda.respuesta}</p>
        {respuestaAyuda.accion !== 'ninguna' && <div className="flex flex-wrap items-center gap-3 border-t border-slate-700 pt-3 text-sm">
          <span>Acción propuesta: {respuestaAyuda.accion.replaceAll('_', ' ')}</span>
          <button className="px-3 py-2 bg-emerald-600 text-white rounded-lg" onClick={() => {
            const vistas = { abrir_plano: 'planoPlaya', abrir_planificacion: 'planning', abrir_auditoria: 'control' };
            if (respuestaAyuda.accion === 'crear_recordatorio') {
              setNuevoRecordatorio({ para: 'Todos', texto: respuestaAyuda.textoPropuesto, prioridad: 'normal', fechaAviso: '', horaAviso: '' });
              setModalNuevoRecordatorioAbierto(true);
            } else if (vistas[respuestaAyuda.accion]) setCurrentView(vistas[respuestaAyuda.accion]);
            setRespuestaAyuda(null);
          }}>Revisar y continuar</button><button className="underline" onClick={() => setRespuestaAyuda(null)}>Descartar</button></div>}</div>}
      <p className="text-xs text-slate-400">Requiere una clave OpenAI guardada en el servidor. La IA no cambia inventarios, auditorías ni configuraciones por sí sola.</p></section>
    <section className={`${themeClasses.card} border rounded-2xl p-5 space-y-3`}><h3 className="font-bold">Comentarios y enseñanzas</h3>
      <p className="text-sm text-slate-400">Guardá una mejora propuesta o una aclaración operativa. Las enseñanzas se incluyen como contexto en futuras consultas de este navegador; no entrenan el modelo ni se convierten en hechos validados.</p>
      <textarea rows={2} maxLength={800} value={comentarioNuevo} onChange={e => setComentarioNuevo(e.target.value)}
        placeholder="Ejemplo: en nuestra planta, esta tarea se verifica al inicio de T2…" className={`w-full p-3 rounded-xl ${themeClasses.input}`} />
      <div className="flex gap-2"><button disabled={!comentarioNuevo.trim()} className="px-3 py-2 bg-slate-700 text-white rounded-lg text-xs" onClick={() => {
        setComentariosMejora(prev => [...prev, { id: nuevoId(), fecha: new Date().toISOString(), tipo: 'mejora', texto: comentarioNuevo.trim() }]); setComentarioNuevo('');
      }}>Guardar mejora</button><button disabled={!comentarioNuevo.trim()} className="px-3 py-2 bg-cyan-700 text-white rounded-lg text-xs" onClick={() => {
        setComentariosMejora(prev => [...prev, { id: nuevoId(), fecha: new Date().toISOString(), tipo: 'enseñanza', texto: comentarioNuevo.trim() }]); setComentarioNuevo('');
      }}>Guardar enseñanza</button></div>
      <ul className="space-y-2 text-sm">{comentariosMejora.map(c => <li key={c.id} className="flex justify-between gap-3 border-t border-slate-700 pt-2"><span><strong>{c.tipo} · </strong>{c.texto}</span>
        <button className="text-red-400" onClick={() => setComentariosMejora(prev => prev.filter(x => x.id !== c.id))}>Eliminar</button></li>)}</ul></section>
  </div></div>;

  const renderClimaView = () => {
    const ubicacion = WEATHER_LOCATIONS[lecturasClima.zona === climaZona ? lecturasClima.zonaSeleccionada : climaZona] ?? WEATHER_LOCATIONS.planta;
    const lecturaActual = lecturasClima.zona === climaZona;
    const fuente = lecturaActual ? lecturasClima.met ?? {} : {};
    const dias = (fuente.dias ?? []).slice(0, 7);
    const diagnostico = dias.length ? dias.map(d =>
      `${new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })}: ${d.lluvia === null ? describirPronostico(d.descripcion).texto.toLowerCase() + ' (sin porcentaje publicado)' : d.lluvia >= 60 ? 'riesgo alto de lluvia; proteger acopios' : d.lluvia >= 30 ? 'riesgo moderado; verificar playa' : 'riesgo bajo; revisar humedad real'}`).join(' · ')
      : 'El pronóstico estará disponible cuando responda MET Norway.';
    return <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8`}><div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap justify-between items-center gap-3"><div>
        <span className="text-sm font-bold text-cyan-400 uppercase">{ubicacion.nombre} · Tucumán</span>
        <h2 className="text-2xl md:text-3xl font-black">Pronóstico para planificar la playa</h2>
        <p className={`text-sm ${themeClasses.subtext}`}>Coordenadas {ubicacion.lat}, {ubicacion.lon} · Datos automáticos de MET Norway, sin clave.</p>
      </div><button onClick={() => setCurrentView('dashboard')} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold">Volver</button></header>
      <div className={`${themeClasses.card} border rounded-2xl p-4 flex flex-wrap items-end gap-3`}>
        <label className="text-sm font-bold flex-1 min-w-56">Ubicación del pronóstico
          <select value={climaZona} onChange={e => { setClimaZona(e.target.value); setGeoClimaEstado(''); }} className={`block mt-1 w-full rounded-xl p-2 ${themeClasses.input}`}>
            <option value="mejor">Mejor cobertura cercana (automática)</option>
            {Object.entries(WEATHER_LOCATIONS).map(([key, place]) => <option key={key} value={key}>{place.nombre}</option>)}
          </select></label>
        <button type="button" onClick={() => {
          if (!navigator.geolocation) { setGeoClimaEstado('La ubicación del dispositivo no está disponible.'); return; }
          setGeoClimaEstado('Buscando ubicación cercana…');
          navigator.geolocation.getCurrentPosition(position => {
            const nearest = nearestWeatherLocation(position.coords.latitude, position.coords.longitude);
            setClimaZona(nearest); setGeoClimaEstado(`Ubicación cercana seleccionada: ${WEATHER_LOCATIONS[nearest].nombre}.`);
          }, () => setGeoClimaEstado('No se pudo acceder a la ubicación. Seleccioná una ciudad de la lista.'), { timeout: 10000, maximumAge: 300000 });
        }} className="px-4 py-2 rounded-xl bg-cyan-700 text-white text-sm font-bold">Usar ubicación cercana</button>
        <span className="text-xs text-slate-400" role="status">{geoClimaEstado || (climaZona === 'mejor' && lecturaActual && dias.length ? `Datos más completos: ${ubicacion.nombre}. ` : '') + (cargandoClima ? 'Consultando pronóstico…' : errorClima ? 'Sin actualización disponible' : 'Actualización automática al ingresar')}</span>
      </div>
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"><h3 className="text-sm font-black text-emerald-400 uppercase mb-2">Planificación orientativa</h3><p className="text-sm leading-relaxed">{diagnostico}</p>
        <p className="text-sm text-slate-400 mt-2">Los símbolos señalan condiciones previstas, no equivalen a un porcentaje de lluvia. Verificá la playa y la tierra antes de descargar o mover acopios.</p></section>
      {dias[0] && <section className={`${themeClasses.card} border rounded-2xl p-5 space-y-3`}><h3 className="text-lg font-bold">Hoy, hora por hora</h3>
        <p className="text-sm text-slate-400">{new Date(`${dias[0].fecha}T12:00:00`).toLocaleDateString('es-AR', { dateStyle: 'full' })} · intervalos disponibles del modelo para {ubicacion.nombre}.</p>
        <div className="flex gap-2 overflow-x-auto pb-2">{(dias[0].horas ?? []).map((h, i) => { const v = describirPronostico(h.simbolo);
          return <div key={`${h.hora}-${i}`} className="min-w-32 border border-slate-700 bg-slate-800/60 rounded-xl p-3 text-sm space-y-1"><strong>{h.hora}</strong>
            <div><span aria-hidden="true">{v.emoji}</span> {h.temperatura == null ? '—' : `${Math.round(h.temperatura)}°`}</div>
            <p className="text-xs">{v.texto}</p><p className="text-xs">Prob. lluvia: {h.probabilidad == null ? 'sin dato' : `${h.probabilidad}%`}</p>
            <p className="text-xs">Agua: {h.lluviaMm == null ? 'sin dato' : `${h.lluviaMm} mm`}</p></div>; })}</div>
      </section>}
      <section className={`${themeClasses.card} border rounded-2xl p-5 space-y-3`}>
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-black text-cyan-400">MET Norway · hasta 7 días</h3>
          <span className="text-sm text-slate-400">{cargandoClima ? 'Consultando…' : errorClima ? (dias.length ? 'Última lectura disponible' : 'Sin datos actuales') : fuente.estado === 'actualizado' ? 'Datos recibidos' : 'Sin datos actuales'}</span></div>
        <p className="text-xs text-slate-400">{ubicacion.nombre} · última lectura {lecturaActual && lecturasClima.actualizado ? new Date(lecturasClima.actualizado).toLocaleString('es-AR') : 'pendiente'}. Datos: Norwegian Meteorological Institute, licencia CC BY 4.0 · <a className="underline" href="https://api.met.no/" target="_blank" rel="noreferrer">Fuente</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Licencia</a>.</p>
        <div className="grid sm:grid-cols-2 gap-3">{dias.map(d => { const visual = describirPronostico(d.descripcion);
          return <div key={d.fecha} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <div className="flex justify-between items-center gap-3"><strong>{new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><strong>{d.max ?? '—'}° / {d.min ?? '—'}°</strong></div>
            <p className="text-sm mt-2"><span aria-hidden="true" className="text-xl mr-2">{visual.emoji}</span>{visual.texto}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-300"><span>Lluvia {d.lluvia == null ? 'sin dato' : `${d.lluvia}%`}</span><span>Agua {d.lluviaMm == null ? 'sin dato' : `${d.lluviaMm} mm`}</span><span>Humedad {d.humedad == null ? '—' : `${d.humedad}%`}</span><span>Viento {d.viento == null ? '—' : `${d.viento} km/h`}</span></div>
          </div>; })}</div>
        {!dias.length && <p className="text-sm text-slate-400">{cargandoClima ? 'Consultando pronóstico…' : 'El pronóstico no está disponible por ahora. Se intentará de nuevo al ingresar.'}</p>}
        <p className="text-xs text-slate-400">Máximas y mínimas calculadas de intervalos publicados. Si no se informa probabilidad o faltan intervalos para la lluvia acumulada, se muestra «sin dato».</p>
      </section>
      <section className={`${themeClasses.card} border rounded-2xl p-5 space-y-2`}><h3 className="font-bold">Consultar otros sitios</h3>
        <p className="text-sm text-slate-400">Estos enlaces abren el pronóstico externo en otra pestaña; sus cifras no se copian ni se mezclan con MET Norway.</p>
        <div className="flex flex-wrap gap-4 text-sm"><a className="underline text-cyan-300" href="https://www.accuweather.com/es/ar/cevil-pozo/11670/weather-forecast/11670" target="_blank" rel="noopener noreferrer">AccuWeather Cevil Pozo ↗</a>
          <a className="underline text-cyan-300" href="https://weather.com/es-AR/ar/tucuman/city/san-miguel-de-tucuman/tenday" target="_blank" rel="noopener noreferrer">The Weather Channel Tucumán ↗</a></div>
      </section>

    </div></div>;
  };

  const renderRecordatoriosView = () => {
    const mes = fechaPizarron.slice(0, 7);
    const primero = new Date(`${mes}-01T12:00:00`);
    const desplazamiento = (primero.getDay() + 6) % 7;
    const inicio = new Date(primero); inicio.setDate(1 - desplazamiento);
    const diasCalendario = Array.from({ length: 42 }, (_, i) => {
      const dia = new Date(inicio); dia.setDate(inicio.getDate() + i);
      return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
    });
    const moverMes = delta => { const d = new Date(`${mes}-01T12:00:00`); d.setMonth(d.getMonth() + delta);
      setFechaPizarron(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); };
    const marcar = async rec => {
      const completado = !rec.completado;
      setRecordatorios(prev => prev.map(r => r.id === rec.id ? {
        ...r, completado, realizadoEn: completado ? new Date().toISOString() : null,
        historial: [...(r.historial ?? []), { accion: completado ? 'Realizado' : 'Reabierto', fecha: new Date().toISOString() }]
      } : r));
      if (rec.sincronizado) try { await consultarAppsScript('completeReminder', { payload: { action: 'completeReminder', id: rec.id, completado } }); }
      catch (error) { showToast('Cambio local sin sincronizar: ' + error.message, 'error'); }
    };
    return <div className={`min-h-screen ${themeClasses.bg} p-4 lg:p-10`}><div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap justify-between items-center gap-3"><div>
        <h2 className="text-2xl md:text-3xl font-black">Pizarrón de recordatorios y tareas</h2>
        <p className="text-sm text-slate-400">Avisos programados y registro de tareas realizadas para la playa de molienda.</p>
      </div><div className="flex gap-2"><button onClick={() => setModalNuevoRecordatorioAbierto(true)} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm">+ Nueva nota</button>
        <button onClick={() => setCurrentView('dashboard')} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm">Volver</button></div></header>
      <div className="flex flex-wrap gap-2"><button onClick={() => setVistaPizarron('lista')} className={`px-4 py-2 rounded-lg text-sm ${vistaPizarron === 'lista' ? 'bg-cyan-600 text-white' : themeClasses.cardSecondary}`}>Listado</button>
        <button onClick={() => setVistaPizarron('calendario')} className={`px-4 py-2 rounded-lg text-sm ${vistaPizarron === 'calendario' ? 'bg-cyan-600 text-white' : themeClasses.cardSecondary}`}>Calendario</button>
        <button onClick={() => setVistaPizarron('realizadas')} className={`px-4 py-2 rounded-lg text-sm ${vistaPizarron === 'realizadas' ? 'bg-cyan-600 text-white' : themeClasses.cardSecondary}`}>Realizadas ({recordatorios.filter(r => r.completado).length})</button></div>
      {vistaPizarron === 'calendario' && <section className={`${themeClasses.card} p-4 rounded-2xl border`}><div className="flex items-center justify-between mb-4">
        <button aria-label="Mes anterior" onClick={() => moverMes(-1)}>←</button><strong>{primero.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</strong><button aria-label="Mes siguiente" onClick={() => moverMes(1)}>→</button></div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-1 mt-2">{diasCalendario.map(d => { const avisos = recordatorios.filter(r => (r.fechaAviso || r.fecha) === d);
          return <button key={d} onClick={() => setFechaPizarron(d)} className={`min-h-16 rounded-lg border p-1 text-left text-xs ${d === fechaPizarron ? 'border-cyan-400' : 'border-slate-700'} ${d.slice(0,7) !== mes ? 'opacity-45' : ''}`}>
            <span>{Number(d.slice(8))}</span>{avisos.length > 0 && <span className="block mt-1 text-cyan-300">{avisos.length} aviso{avisos.length === 1 ? '' : 's'}</span>}</button>; })}</div>
        <h3 className="mt-4 font-bold">{new Date(`${fechaPizarron}T12:00:00`).toLocaleDateString('es-AR', { dateStyle: 'full' })}</h3>
        <ul className="text-sm mt-2 space-y-1">{recordatorios.filter(r => (r.fechaAviso || r.fecha) === fechaPizarron).map(r => <li key={r.id}>{r.horaAviso || 'Sin hora'} · {r.texto} {r.completado ? '✓' : ''}</li>)}</ul>
      </section>}
      {vistaPizarron !== 'calendario' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{recordatorios.filter(r => vistaPizarron === 'realizadas' ? r.completado : !r.completado).map(rec =>
        <article key={rec.id} className={`${themeClasses.card} p-5 rounded-2xl border space-y-3`}>
          <div className="flex justify-between gap-2"><span className="font-bold text-cyan-400 text-xs uppercase">{rec.prioridad}</span><span className="text-xs text-slate-400">Para: {rec.para}</span></div>
          <p className="text-sm font-medium">{rec.texto}</p>
          <p className="text-xs text-slate-400">{rec.fechaAviso ? `Programado: ${rec.fechaAviso} ${rec.horaAviso || 'sin hora'}` : `Creado: ${rec.fecha}`} · {rec.sincronizado ? `Sheets / Telegram: ${rec.estadoTelegram || 'sin programación'}` : 'Solo en este navegador'}</p>
          {rec.realizadoEn && <p className="text-xs text-emerald-400">Realizado: {new Date(rec.realizadoEn).toLocaleString('es-AR')}</p>}
          <div className="flex justify-between gap-3 border-t border-slate-700 pt-2"><button className="text-xs font-bold text-cyan-400" onClick={() => marcar(rec)}>{rec.completado ? 'Reabrir tarea' : 'Marcar como realizada'}</button>
            <button aria-label="Eliminar aviso" className="text-xs text-red-400" onClick={() => setRecordatorios(prev => prev.filter(r => r.id !== rec.id))}><Icons.Trash /></button></div>
        </article>)}</div>}
      <section className={`${themeClasses.card} p-4 rounded-2xl border text-sm space-y-2`}><h3 className="font-bold">Avisos en este dispositivo</h3>
        <p className="text-slate-400">La notificación aparece si permitís avisos y mantenés abierta la aplicación al llegar la hora. El calendario conserva la tarea aunque cierres la pestaña.</p>
        <button className="px-3 py-2 bg-cyan-600 text-white rounded-lg text-xs" onClick={async () => {
          if (typeof Notification === 'undefined') return showToast('Este navegador no admite notificaciones.', 'error');
          const permiso = await Notification.requestPermission(); setPermisoAvisos(permiso);
        }}>Permitir notificaciones ({permisoAvisos})</button></section>
    </div></div>;
  };

  const renderPlanning = () => (
    <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8 flex flex-col`}>
      <div className={`max-w-5xl mx-auto w-full ${themeClasses.card} rounded-[2rem] shadow-2xl overflow-hidden flex flex-col flex-1`}>
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-black">Planificador Semanal por Turnos</h2>
            <p className="text-slate-400 text-sm font-bold mt-1">Paso {currentStep} de 4 • T1 (22 a 06), T2 (06 a 14) y T3 (14 a 22)</p>
          </div>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs cursor-pointer"
          >
            Volver al Panel
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 bg-slate-900/60 border-b border-slate-800 text-sm font-black text-center">
          <button onClick={() => setCurrentStep(1)} className={`py-3.5 border-b-2 transition-all cursor-pointer ${currentStep === 1 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-400'}`}>
            1. Asignación de Turnos (T1/T2/T3)
          </button>
          <button onClick={() => setCurrentStep(2)} className={`py-3.5 border-b-2 transition-all cursor-pointer ${currentStep === 2 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-400'}`}>
            2. Tareas de Playa & Mezclas
          </button>
          <button onClick={() => setCurrentStep(3)} className={`py-3.5 border-b-2 transition-all cursor-pointer ${currentStep === 3 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-400'}`}>
            3. Logística de Camiones
          </button>
          <button onClick={() => setCurrentStep(4)} className={`py-3.5 border-b-2 transition-all cursor-pointer ${currentStep === 4 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-400'}`}>
            4. Indicaciones de la semana
          </button>
        </div>

        <div className="p-8 flex-1 overflow-y-auto space-y-6">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-1">Fecha Inicio del Plan</label>
                  <input
                    type="date"
                    value={plan.fechaInicio}
                    onChange={e => setPlan(prev => ({ ...prev, fechaInicio: e.target.value }))}
                    className={`w-full p-2.5 rounded-xl font-bold text-xs ${themeClasses.input}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-400 mb-1">Fecha Fin del Plan</label>
                  <input
                    type="date"
                    value={plan.fechaFin}
                    onChange={e => setPlan(prev => ({ ...prev, fechaFin: e.target.value }))}
                    className={`w-full p-2.5 rounded-xl font-bold text-xs ${themeClasses.input}`}
                  />
                </div>
              </div>

              {/* Bloques de Turnos T1, T2 y T3 */}
              {(['T1', 'T2', 'T3']).map(tKey => {
                const conf = TURNOS_CONFIG[tKey];
                const operariosTurno = plan.personal.filter(p => p.turno === tKey);

                return (
                  <div key={tKey} className={`${themeClasses.cardSecondary} p-5 rounded-2xl border space-y-4`}>
                    <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
                      <div>
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          tKey === 'T1' ? 'bg-indigo-500/20 text-indigo-400' :
                          tKey === 'T2' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {conf.id}
                        </span>
                        <h4 className="text-base font-black text-white inline-block ml-2">{conf.nombre}</h4>
                        <span className="text-xs text-slate-400 ml-2 font-mono">({conf.defaultInicio} a {conf.defaultFin})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nuevo = {
                            id: nuevoId(),
                            operario: operadores[0]?.nombre || "Díaz, José",
                            rol: "Operario de Molienda",
                            maquina: "",
                            turno: tKey,
                            inicio: conf.defaultInicio,
                            fin: conf.defaultFin
                          };
                          setPlan(prev => ({ ...prev, personal: [...prev.personal, nuevo] }));
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Icons.Plus /> <span>+ Asignar a {conf.id}</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {operariosTurno.map(op => (
                        <div key={op.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 items-center">
                          <div>
                            <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Operario</label>
                            <select
                              value={op.operario}
                              onChange={e => {
                                const val = e.target.value;
                                setPlan(prev => ({ ...prev, personal: prev.personal.map(p => p.id === op.id ? { ...p, operario: val } : p) }));
                              }}
                              className={`w-full p-1.5 rounded-lg text-xs font-bold ${themeClasses.input}`}
                            >
                              {operadores.filter(o => o.activo).map(o => <option key={o.id} value={o.nombre} className="text-slate-900">{o.nombre}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Puesto</label>
                            <select
                              value={op.rol}
                              onChange={e => {
                                const val = e.target.value;
                                const maq = val === "Maquinista" ? (maquinas[0]?.nombre || "") : "";
                                setPlan(prev => ({ ...prev, personal: prev.personal.map(p => p.id === op.id ? { ...p, rol: val, maquina: maq } : p) }));
                              }}
                              className={`w-full p-1.5 rounded-lg text-xs font-bold ${themeClasses.input}`}
                            >
                              {ROLES_OPERATIVOS.map(r => <option key={r} value={r} className="text-slate-900">{r}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Pala (Si es Maquinista)</label>
                            <select
                              disabled={op.rol !== "Maquinista"}
                              value={op.maquina}
                              onChange={e => {
                                const val = e.target.value;
                                setPlan(prev => ({ ...prev, personal: prev.personal.map(p => p.id === op.id ? { ...p, maquina: val } : p) }));
                              }}
                              className={`w-full p-1.5 rounded-lg text-xs font-bold ${themeClasses.input} ${op.rol !== "Maquinista" ? 'opacity-40' : 'text-cyan-400'}`}
                            >
                              <option value="">Ninguna...</option>
                              {maquinas.filter(m => m.activo).map(m => <option key={m.id} value={m.nombre} className="text-slate-900">{m.nombre}</option>)}
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <div className="flex-1">
                              <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Inicio</label>
                              <input
                                type="time"
                                value={op.inicio}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPlan(prev => ({ ...prev, personal: prev.personal.map(p => p.id === op.id ? { ...p, inicio: val } : p) }));
                                }}
                                className={`w-full p-1.5 rounded-lg text-xs font-mono font-bold ${themeClasses.input}`}
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Fin</label>
                              <input
                                type="time"
                                value={op.fin}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPlan(prev => ({ ...prev, personal: prev.personal.map(p => p.id === op.id ? { ...p, fin: val } : p) }));
                                }}
                                className={`w-full p-1.5 rounded-lg text-xs font-mono font-bold ${themeClasses.input}`}
                              />
                            </div>
                          </div>

                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => setPlan(prev => ({ ...prev, personal: prev.personal.filter(p => p.id !== op.id) }))}
                              className="text-slate-500 hover:text-red-400 p-1.5 cursor-pointer"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paso 2: Tareas de Playa & Mezclas de Acopio */}
          {currentStep === 2 && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-lg font-black">Tareas Operativas de Playa</h3>
                    <p className="text-sm text-slate-400">Asigne una acción a un sector y seleccione uno, dos o tres turnos.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const sectorLibre = sectores.find(s => s.activo && !plan.tareasPlaya.some(t => clave(t.sector) === clave(s.nombre)));
                      if (!sectorLibre) return showToast('Todos los sectores ya tienen una tarea planificada.', 'error');
                      const nueva = {
                        id: nuevoId(),
                        accion: accionesPlaya[0]?.nombre || "Regado",
                        sector: sectorLibre.nombre,
                        turno: "T2",
                        turnos: ['T2'],
                        notas: ""
                      };
                      setPlan(prev => ({ ...prev, tareasPlaya: [...prev.tareasPlaya, nueva] }));
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Icons.Plus /> <span>+ Agregar Tarea</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {plan.tareasPlaya.map(t => (
                    <div key={t.id} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 items-center">
                      <div>
                        <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Acción</label>
                        <select
                          value={t.accion}
                          onChange={e => {
                            const val = e.target.value;
                            setPlan(prev => ({ ...prev, tareasPlaya: prev.tareasPlaya.map(item => item.id === t.id ? { ...item, accion: val } : item) }));
                          }}
                          className={`w-full p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                        >
                          {accionesPlaya.filter(a => a.activo).map(a => <option key={a.id} value={a.nombre} className="text-slate-900">{a.nombre}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Sector Intervenido</label>
                        <select
                          value={t.sector}
                          onChange={e => {
                            const val = e.target.value;
                            if (plan.tareasPlaya.some(item => item.id !== t.id && clave(item.sector) === clave(val)))
                              return showToast('Ese sector ya tiene una tarea.', 'error');
                            setPlan(prev => ({ ...prev, tareasPlaya: prev.tareasPlaya.map(item => item.id === t.id ? { ...item, sector: val } : item) }));
                          }}
                          className={`w-full p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                        >
                          {sectores.filter(s => s.activo).map(s => <option key={s.id} value={s.nombre} className="text-slate-900">{s.nombre}</option>)}
                        </select>
                      </div>

                      <fieldset>
                        <legend className="block text-xs uppercase font-black text-slate-400 mb-1">Turnos responsables</legend>
                        <div className="flex flex-wrap gap-2">{['T1', 'T2', 'T3'].map(turno => {
                          const elegidos = t.turnos?.length ? t.turnos : [t.turno || 'T2'];
                          return <label key={turno} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-sm ${elegidos.includes(turno) ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10' : 'border-slate-700 text-slate-400'}`}>
                            <input type="checkbox" checked={elegidos.includes(turno)} onChange={() => {
                              const siguientes = elegidos.includes(turno) ? elegidos.filter(x => x !== turno) : [...elegidos, turno].sort();
                              if (!siguientes.length) return showToast('Seleccioná al menos un turno.', 'error');
                              setPlan(prev => ({ ...prev, tareasPlaya: prev.tareasPlaya.map(item => item.id === t.id
                                ? { ...item, turnos: siguientes, turno: siguientes.join(', ') } : item) }));
                            }} />{turno}</label>;
                        })}</div>
                      </fieldset>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={t.notas || ""}
                          placeholder="Notas..."
                          onChange={e => {
                            const val = e.target.value;
                            setPlan(prev => ({ ...prev, tareasPlaya: prev.tareasPlaya.map(item => item.id === t.id ? { ...item, notas: val } : item) }));
                          }}
                          className={`flex-1 p-2 rounded-lg text-xs ${themeClasses.input}`}
                        />
                        <button
                          type="button"
                          onClick={() => setPlan(prev => ({ ...prev, tareasPlaya: prev.tareasPlaya.filter(item => item.id !== t.id) }))}
                          className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                        >
                          <Icons.Trash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mezclas de Acopios con Proporciones */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-amber-400">Recetas de Acopio con Proporción de Paladas</h3>
                    <p className="text-xs text-slate-400">Cree un acopio nuevo mezclando componentes (ej: 3 paladas Cantera + 1 Excavación).</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nuevaRec = {
                        id: nuevoId(),
                        nombreNuevoAcopio: `Acopio Mezcla ${plan.recetasAcopio.length + 1}`,
                        componente1: canteras[0]?.nombre || "Cantera del Chañar",
                        paladas1: 3,
                        componente2: canteras[1]?.nombre || "Excavación B° Congreso",
                        paladas2: 1,
                        pisosPrevistos: 2,
                        sectorDestino: "Playa Logística Central"
                      };
                      setPlan(prev => ({ ...prev, recetasAcopio: [...prev.recetasAcopio, nuevaRec] }));
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <Icons.Plus /> <span>+ Nueva Receta</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {plan.recetasAcopio.map(rec => (
                    <div key={rec.id} className={`${themeClasses.cardSecondary} p-4 rounded-2xl border space-y-3`}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Nombre Nuevo Acopio</label>
                          <input
                            type="text"
                            value={rec.nombreNuevoAcopio}
                            onChange={e => {
                              const val = e.target.value;
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, nombreNuevoAcopio: val } : r) }));
                            }}
                            className={`w-full p-2 rounded-lg font-black text-xs ${themeClasses.input}`}
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Sector Destino en Plano</label>
                          <select
                            value={rec.sectorDestino}
                            onChange={e => {
                              const val = e.target.value;
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, sectorDestino: val } : r) }));
                            }}
                            className={`w-full p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                          >
                            {sectoresVirtuales.map(s => <option key={s.id} value={s.nombre} className="text-slate-900">{s.nombre}</option>)}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Pisos Previstos</label>
                          <select
                            value={rec.pisosPrevistos || 1}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, pisosPrevistos: val } : r) }));
                            }}
                            className={`w-full p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                          >
                            <option value={1}>1 Piso (Base)</option>
                            <option value={2}>2 Pisos (Remonte Medio)</option>
                            <option value={3}>3 Pisos (Pirámide)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-700/60">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={rec.paladas1}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, paladas1: val } : r) }));
                            }}
                            className={`w-16 p-2 rounded-lg text-center font-black text-xs ${themeClasses.input}`}
                          />
                          <span className="text-xs font-bold text-slate-400">paladas de:</span>
                          <select
                            value={rec.componente1}
                            onChange={e => {
                              const val = e.target.value;
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, componente1: val } : r) }));
                            }}
                            className={`flex-1 p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                          >
                            {canteras.map(c => <option key={c.id} value={c.nombre} className="text-slate-900">{c.nombre}</option>)}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-amber-400">+</span>
                          <input
                            type="number"
                            min="1"
                            value={rec.paladas2}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, paladas2: val } : r) }));
                            }}
                            className={`w-16 p-2 rounded-lg text-center font-black text-xs ${themeClasses.input}`}
                          />
                          <span className="text-xs font-bold text-slate-400">paladas de:</span>
                          <select
                            value={rec.componente2}
                            onChange={e => {
                              const val = e.target.value;
                              setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.map(r => r.id === rec.id ? { ...r, componente2: val } : r) }));
                            }}
                            className={`flex-1 p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                          >
                            {canteras.map(c => <option key={c.id} value={c.nombre} className="text-slate-900">{c.nombre}</option>)}
                          </select>

                          <button
                            type="button"
                            onClick={() => setPlan(prev => ({ ...prev, recetasAcopio: prev.recetasAcopio.filter(r => r.id !== rec.id) }))}
                            className="text-slate-500 hover:text-red-400 p-1.5 cursor-pointer"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paso 3: Planificación de Camiones */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-black">Planificación de Recepción de Camiones</h3>
                  <p className="text-xs text-slate-400">Defina orígenes y acopios de recepción sin toneladas obligatorias.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nuevo = {
                      id: nuevoId(),
                      origen: canteras[0]?.nombre || "Cantera del Chañar",
                      destino: stockPlaya[0]?.nombre || "Acopio Mezcla Principal",
                      turno: "T2",
                      notas: ""
                    };
                    setPlan(prev => ({ ...prev, camiones: [...prev.camiones, nuevo] }));
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Icons.Plus /> <span>+ Planificar Camión</span>
                </button>
              </div>

              <div className="space-y-3">
                {plan.camiones.map(c => (
                  <div key={c.id} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 items-center">
                    <div>
                      <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Origen (Cantera / Excavación)</label>
                      <select
                        value={c.origen}
                        onChange={e => {
                          const val = e.target.value;
                          setPlan(prev => ({ ...prev, camiones: prev.camiones.map(item => item.id === c.id ? { ...item, origen: val } : item) }));
                        }}
                        className={`w-full p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                      >
                        {canteras.filter(cn => cn.activo).map(cn => <option key={cn.id} value={cn.nombre} className="text-slate-900">{cn.nombre}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Destino de descarga</label>
                      <select
                        value={c.destino}
                        onChange={e => {
                          const val = e.target.value;
                          setPlan(prev => ({ ...prev, camiones: prev.camiones.map(item => item.id === c.id ? { ...item, destino: val } : item) }));
                        }}
                        className={`w-full p-2 rounded-lg text-xs font-bold text-cyan-400 ${themeClasses.input}`}
                      >
                        {stockPlaya.map(a => <option key={a.id} value={a.nombre} className="text-slate-900">{a.nombre}</option>)}
                        {plan.recetasAcopio.filter(r => !stockPlaya.some(a => clave(a.nombre) === clave(r.nombreNuevoAcopio)))
                          .map(r => <option key={`plan-${r.id}`} value={r.nombreNuevoAcopio} className="text-slate-900">◇ {r.nombreNuevoAcopio} (planificado)</option>)}
                        <option value="Cajón 2 - Entrada Silo">Cajón 2 - Entrada Silo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-black text-slate-400 mb-0.5">Turno</label>
                      <select
                        value={c.turno}
                        onChange={e => {
                          const val = e.target.value;
                          setPlan(prev => ({ ...prev, camiones: prev.camiones.map(item => item.id === c.id ? { ...item, turno: val } : item) }));
                        }}
                        className={`w-full p-2 rounded-lg text-xs font-bold ${themeClasses.input}`}
                      >
                        <option value="T1">T1 (Noche)</option>
                        <option value="T2">T2 (Mañana)</option>
                        <option value="T3">T3 (Tarde)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Observación..."
                        value={c.notas || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setPlan(prev => ({ ...prev, camiones: prev.camiones.map(item => item.id === c.id ? { ...item, notas: val } : item) }));
                        }}
                        className={`flex-1 p-2 rounded-lg text-xs ${themeClasses.input}`}
                      />
                      <button
                        type="button"
                        onClick={() => setCamionMapaId(c.id)}
                        className="px-2 py-1.5 rounded-lg border border-cyan-500/50 text-cyan-300 text-xs font-bold"
                      >Plano</button>
                      <button
                        type="button"
                        onClick={() => setPlan(prev => ({ ...prev, camiones: prev.camiones.filter(item => item.id !== c.id) }))}
                        className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 space-y-3">
                <div><h4 className="font-black text-cyan-300">Ayuda de descarga en el plano</h4>
                  <p className="text-sm text-slate-400">Seleccioná “Plano” en un camión y tocá el acopio de destino. Los contornos punteados son acopios planificados.</p></div>
                <svg viewBox="0 0 940 480" className="w-full max-h-72 rounded-xl bg-slate-950 border border-slate-700" aria-label="Plano para elegir destino de camiones">
                  <polygon points={stringPuntosPoligono} fill="#10262d" stroke="#4b9b9a" strokeWidth="3" />
                  {sectoresVirtuales.map(s => <g key={s.id}><rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.color} fillOpacity=".12" stroke={s.color} strokeDasharray="5 4" /><text x={s.x + 8} y={s.y + 16} fill="#d1d5db" fontSize="13">{s.nombre}</text></g>)}
                  {[...stockPlaya, ...plan.recetasAcopio.filter(r => !stockPlaya.some(a => clave(a.nombre) === clave(r.nombreNuevoAcopio))).map(acopioDesdeReceta)]
                    .map(a => <g key={a.recetaId ?? a.id} onClick={() => {
                      if (!camionMapaId) return showToast('Seleccioná primero un camión con el botón Plano.', 'error');
                      setPlan(prev => ({ ...prev, camiones: prev.camiones.map(c => c.id === camionMapaId ? { ...c, destino: a.nombre } : c) }));
                    }} className="cursor-pointer">
                      <ellipse cx={a.posX} cy={a.posY} rx={a.largoEje || 40} ry={(a.radioBase || 30) * .72}
                        fill={a.esFuturo ? '#78350f' : '#0f766e'} stroke={a.esFuturo ? '#fbbf24' : '#5eead4'}
                        strokeWidth="3" strokeDasharray={a.esFuturo ? '7 4' : undefined} />
                      <text x={a.posX} y={a.posY + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{a.nombre}</text>
                    </g>)}
                </svg>
                <p className="text-sm text-cyan-300">{camionMapaId ? `Camión seleccionado: ${plan.camiones.find(c => c.id === camionMapaId)?.origen ?? ''} → ${plan.camiones.find(c => c.id === camionMapaId)?.destino ?? ''}` : 'Elegí un camión para asignar el lugar de descarga.'}</p>
              </div>
            </div>
          )}
          {currentStep === 4 && <div className="space-y-4">
            <h3 className="text-xl font-black">Indicaciones adicionales para la semana</h3>
            <p className="text-sm text-slate-400">Explicá prioridades, restricciones, secuencia de trabajo o cualquier novedad que deban conocer los tres turnos.</p>
            <textarea rows={9} value={plan.observacionSemanal ?? ''}
              spellCheck="true" lang="es-AR"
              onChange={e => { setPlan(prev => ({ ...prev, observacionSemanal: e.target.value, indicacionesEstructuradas: [] })); setSugerenciaIndicaciones(null); }}
              placeholder="Ej.: priorizar el secado de la zona norte antes de recibir los camiones..."
              className={`w-full rounded-xl p-4 text-base ${themeClasses.input}`} />
            <button type="button" onClick={organizarIndicaciones} disabled={organizandoIndicaciones || !plan.observacionSemanal?.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{organizandoIndicaciones ? 'Organizando…' : 'Corregir y estructurar con IA'}</button>
            {sugerenciaIndicaciones && <section className={`${themeClasses.cardSecondary} border rounded-xl p-4 space-y-3`}>
              <h4 className="font-semibold">Propuesta para revisar</h4><p className="whitespace-pre-wrap text-sm">{sugerenciaIndicaciones.texto}</p>
              <div className="space-y-1">{sugerenciaIndicaciones.tareas.map((t,i) => <p key={i} className="text-sm">
                <strong>{t.categoria}</strong> · {t.descripcion}{t.sector ? ` · ${t.sector}` : ''}{t.turno ? ` · ${t.turno}` : ''}</p>)}</div>
              <button type="button" onClick={() => { setPlan(prev => ({ ...prev, observacionOriginal: prev.observacionSemanal,
                observacionSemanal: sugerenciaIndicaciones.texto, indicacionesEstructuradas: sugerenciaIndicaciones.tareas.map(t => ({ ...t, validada: false })) }));
                setSugerenciaIndicaciones(null); }} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Aceptar propuesta</button>
              <button type="button" onClick={() => setSugerenciaIndicaciones(null)} className="ml-2 text-sm underline">Descartar</button>
            </section>}
            {!!plan.indicacionesEstructuradas?.length && <section className={`${themeClasses.cardSecondary} border rounded-xl p-4 space-y-2`}>
              <h4 className="font-semibold">Acciones detectadas · pendientes de validación</h4>
              {plan.indicacionesEstructuradas.map((t,i) => <div key={i} className="flex flex-wrap gap-3 items-center text-sm border-t border-slate-600/40 pt-2">
                <span className="flex-1">{t.categoria}: {t.descripcion}{t.sector ? ` · ${t.sector}` : ' · sector por definir'}</span>
                <button type="button" onClick={() => setPlan(prev => ({ ...prev, indicacionesEstructuradas: prev.indicacionesEstructuradas.map((x,j) => j === i ? { ...x, validada: !x.validada } : x) }))}
                  className="rounded-lg border border-teal-500/50 px-3 py-1">{t.validada ? 'Validada' : 'Validar'}</button></div>)}
            </section>}
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-4 text-sm">
              {plan.tareasPlaya.length} tareas · {plan.recetasAcopio.length} acopios planificados · {plan.camiones.length} ingresos previstos.
            </div>
          </div>}
        </div>

        {/* Footer del Wizard de Planificación */}
        <div className="bg-slate-900 p-6 border-t border-slate-800 flex justify-between items-center">
          <button
            onClick={() => setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 1}
            className={`px-6 py-2.5 font-bold rounded-xl transition-all cursor-pointer ${currentStep === 1 ? 'opacity-0 pointer-events-none' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Paso Anterior
          </button>
          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep(prev => prev + 1)}
              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-500 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Siguiente Paso</span>
              <Icons.ArrowRight />
            </button>
          ) : (
            <button
              onClick={() => {
                materializarAcopiosPlanificados();
                setPlan(prev => ({ ...prev, activa: true }));
                showToast("Plan Semanal confirmado y activado.");
                setCurrentView('dashboard');
              }}
              className="px-10 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black rounded-xl shadow-xl hover:from-emerald-400 hover:to-teal-400 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Icons.Check />
              <span>Confirmar Plan</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderControl = () => (
    <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8 flex flex-col`}>
      <div className={`max-w-6xl mx-auto w-full ${themeClasses.card} rounded-[2rem] shadow-2xl overflow-hidden flex flex-col flex-1`}>
        <div className="bg-emerald-700 p-6 text-white flex justify-between items-center border-b border-emerald-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center">
              <Icons.Check />
            </div>
            <div>
              <h2 className="text-xl font-black">Auditoría Diaria • Gestión Molienda</h2>
              <p className="text-emerald-100 text-xs font-bold">
                Jornada Auditada: {control.fechaAuditada || "Hoy"} • Paso {currentStep} de 4
              </p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-emerald-100 hover:text-white font-bold text-xs bg-white/10 px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            Volver al Panel
          </button>
        </div>

        <div className="grid grid-cols-4 bg-slate-900/50 border-b border-slate-800 text-xs font-bold text-center">
          <button onClick={() => setCurrentStep(1)} className={`py-4 border-b-2 transition-all cursor-pointer ${currentStep === 1 ? 'border-emerald-500 text-emerald-400 font-black bg-emerald-500/10' : 'border-transparent text-slate-400'}`}>
            Paso 1: Asistencia & Paradas
          </button>
          <button onClick={() => setCurrentStep(2)} className={`py-4 border-b-2 transition-all cursor-pointer ${currentStep === 2 ? 'border-emerald-500 text-emerald-400 font-black bg-emerald-500/10' : 'border-transparent text-slate-400'}`}>
            Paso 2: Tareas & Camiones (0-3)
          </button>
          <button onClick={() => setCurrentStep(3)} className={`py-4 border-b-2 transition-all cursor-pointer ${currentStep === 3 ? 'border-emerald-500 text-emerald-400 font-black bg-emerald-500/10' : 'border-transparent text-slate-400'}`}>
            Paso 3: Volumetría & Paladas
          </button>
          <button onClick={() => setCurrentStep(4)} className={`py-4 border-b-2 transition-all cursor-pointer ${currentStep === 4 ? 'border-emerald-500 text-emerald-400 font-black bg-emerald-500/10' : 'border-transparent text-slate-400'}`}>
            Paso 4: Resumen & Sincronizar
          </button>
        </div>

        <div className="p-8 flex-1 overflow-y-auto">
          {/* Paso 1: Asistencia y Registro de Paradas */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-black">Validación de Personal y Registro de Paradas</h3>
                <p className={`text-xs ${themeClasses.subtext} mt-1`}>
                  Confirme asistencia, reasigne puestos o máquinas si hubo rotación, y registre incidentes mecánicos directamente al costado del maquinista.
                </p>
                {plan.observacionSemanal?.trim() && <p className="mt-3 p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-sm whitespace-pre-wrap">{plan.observacionSemanal}</p>}
              </div>

              <div className="space-y-4">
                {control.asistencia.map((p) => {
                  const huboCambioPuesto = p.rolReal !== p.rolPlanificado;
                  const huboCambioMaquina = p.maquinaReal !== p.maquinaPlanificada;
                  const habilitado = operadores.find(o => o.nombre === p.operario)?.puestosHabilitados?.includes(p.rolReal);
                  const paradasDeEsteOperario = control.paradasMaquinas.filter(pr => pr.maquinista === p.operario || pr.maquina === p.maquinaReal);

                  return (
                    <div key={p.id} className={`${themeClasses.cardSecondary} p-5 rounded-2xl border space-y-4`}>
                      <div className="flex flex-wrap justify-between items-start gap-4">
                        <div>
                          <h4 className="font-black text-base text-white">{p.operario}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Planificado: <strong>{p.rolPlanificado}</strong> {p.maquinaPlanificada && `• ${p.maquinaPlanificada}`} ({p.inicio} a {p.fin})
                          </p>
                          {!habilitado && p.estado !== 'ausente' &&
                            <p className="text-xs text-amber-400 font-bold mt-1">⚠ Puesto real no habilitado en la matriz de habilidades</p>}
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={p.estado}
                            onChange={e => handleEstadoAsistencia(p.id, e.target.value)}
                            className={`p-2 rounded-xl text-xs font-black ${
                              p.estado === 'cumplio' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                              p.estado === 'ausente' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                              'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            }`}
                          >
                            <option value="pendiente">Confirmar asistencia…</option>
                            <option value="cumplio">Cumplió Horario</option>
                            <option value="ausente">Ausente</option>
                            <option value="llegada_tarde">Llegó tarde</option>
                            <option value="llegada_temprana">Llegó temprano</option>
                            <option value="retiro_temprano">Se retiró temprano</option>
                            <option value="extras">Horas Extras</option>
                            <option value="horario_modificado">Horario modificado / combinado</option>
                          </select>

                          {p.rolReal === "Maquinista" && (
                            <button
                              type="button"
                              onClick={() => {
                                setModalParadaData({
                                  maquina: p.maquinaReal || maquinas[0]?.nombre || "CAT 938 H (N°6)",
                                  maquinista: p.operario,
                                  motivoDesperfecto: MOTIVOS_PARADA_VALIDADOS[0],
                                  horaInicio: "",
                                  horaFin: "",
                                  continuaParada: false,
                                  resuelto: false,
                                  observaciones: ""
                                });
                                setModalParadaAbierto(true);
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer ${
                                paradasDeEsteOperario.length > 0
                                  ? 'bg-red-600 text-white shadow-md'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                              }`}
                            >
                              <Icons.Alert />
                              <span>{paradasDeEsteOperario.length > 0 ? `⚠️ Parada (${paradasDeEsteOperario.length})` : '+ Reportar Parada'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs font-bold">
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">
                            Puesto Real {huboCambioPuesto && <span className="text-amber-400 font-black">• Modificado</span>}
                          </label>
                          <select
                            value={p.rolReal}
                            onChange={e => handleCambioPuestoReal(p.id, e.target.value)}
                            className={`w-full p-2 rounded-xl ${themeClasses.input}`}
                          >
                            {ROLES_OPERATIVOS.map(r => <option key={r} value={r} className="text-slate-900">{r}</option>)}
                          </select>
                        </div>

                        {p.rolReal === "Maquinista" && (
                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 mb-1">
                              Pala Real {huboCambioMaquina && <span className="text-amber-400 font-black">• Cambio de Pala</span>}
                            </label>
                            <select
                              value={p.maquinaReal}
                              onChange={e => handleCambioMaquinaReal(p.id, e.target.value)}
                              className={`w-full p-2 rounded-xl text-cyan-400 ${themeClasses.input}`}
                            >
                              {maquinas.filter(m => m.activo).map(m => (
                                <option key={m.id} value={m.nombre} className="text-slate-900">{m.nombre} [{m.m3PorPalada}m³]</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Observación de Turno</label>
                          <input
                            type="text"
                            value={p.observacion || ""}
                            onChange={e => {
                              const val = e.target.value;
                              setControl(prev => ({
                                ...prev,
                                asistencia: prev.asistencia.map(a => a.id === p.id ? { ...a, observacion: val } : a)
                              }));
                            }}
                            placeholder="Novedades o motivos de cambio..."
                            className={`w-full p-2 rounded-xl text-xs ${themeClasses.input}`}
                          />
                        </div>
                      </div>
                      {p.estado !== 'ausente' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        {[['inicioReal', 'Entrada real', p.inicio], ['finReal', 'Salida real', p.fin]].map(([campo, etiqueta, prevista]) =>
                          <label key={campo} className="text-sm font-semibold text-slate-300">{etiqueta} <span className="text-slate-500">(prevista {prevista})</span>
                            <input type="time" value={p[campo] || ''} onChange={e => {
                              const hora = e.target.value;
                              setControl(prev => ({ ...prev, asistencia: prev.asistencia.map(a => a.id === p.id
                                ? { ...a, [campo]: hora, estado: a.estado === 'cumplio' && hora !== prevista ? 'horario_modificado' : a.estado } : a) }));
                            }} className={`mt-1 w-full p-2 rounded-xl ${themeClasses.input}`} />
                          </label>)}
                      </div>}
                      {errorAsistencia(p) && <p role="alert" className="text-sm text-amber-300">{errorAsistencia(p)}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paso 2: Tareas y Logística de Tierra */}
          {currentStep === 2 && (
            <div className="space-y-10">
              <div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                  <div>
                    <h3 className="text-lg font-black">Tareas de Playa Realizadas en el Turno</h3>
                    <p className={`text-xs ${themeClasses.subtext}`}>Valide el cumplimiento y adjunte fotos de Inicio y Fin a demanda.</p>
                  </div>
                  <button
                    onClick={() => {
                      setNuevaTareaExtra({ accion: accionesPlaya[0]?.nombre || "Regado", sector: sectores[0]?.nombre || "Playa Logística Central", notas: "" });
                      setModalTareaExtraAbierto(true);
                    }}
                    className="px-3.5 py-2 bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-500/30 transition-colors cursor-pointer"
                  >
                    <Icons.Plus /> <span>+ Tarea Extra No Planificada</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {control.tareasAuditadas.map((t) => (
                    <div key={t.id} className={`${themeClasses.cardSecondary} p-4 rounded-2xl border space-y-3`}>
                      <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                          <h4 className="font-black text-sm text-white flex items-center gap-2">
                            <span>{t.accion}</span>
                            <span className="text-cyan-400">en {t.sector}</span>
                            {t.esNoPlanificada && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                No Planificada
                              </span>
                            )}
                          </h4>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-xs font-black">
                            <span>¿Se realizó?</span>
                            <select disabled={t.esNoPlanificada} value={t.realizadaEnTurno === null ? 'pendiente' : String(t.realizadaEnTurno)}
                              onChange={e => setControl(prev => ({ ...prev,
                                tareasAuditadas: prev.tareasAuditadas.map(item => item.id === t.id
                                  ? { ...item, realizadaEnTurno: e.target.value === 'pendiente' ? null : e.target.value === 'true' }
                                  : item) }))}
                              className={`p-2 rounded-lg ${themeClasses.input}`}>
                              {!t.esNoPlanificada && <option value="pendiente">Pendiente</option>}<option value="true">Sí</option>{!t.esNoPlanificada && <option value="false">No</option>}
                            </select>
                          </label>

                          {t.realizadaEnTurno && (
                            <button
                              type="button"
                              onClick={() => {
                                setControl(prev => ({
                                  ...prev,
                                  tareasAuditadas: prev.tareasAuditadas.map(item => item.id === t.id ? { ...item, mostrarFotos: !item.mostrarFotos } : item)
                                }));
                              }}
                              className="px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1 cursor-pointer"
                            >
                              <Icons.Camera />
                              <span>{t.mostrarFotos ? "Ocultar Fotos" : "Registro Fotográfico"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {t.realizadaEnTurno && <fieldset className="flex flex-wrap gap-3 border-t border-slate-700/70 pt-3">
                        <legend className="text-sm text-slate-300">Turnos en que se realizó</legend>
                        {['T1','T2','T3'].map(turno => { const elegidos = t.turnosRealizados ?? (t.turnos?.length ? t.turnos : [t.turno || 'T2']);
                          return <label key={turno} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={elegidos.includes(turno)}
                            onChange={() => setControl(prev => ({ ...prev, tareasAuditadas: prev.tareasAuditadas.map(x => x.id !== t.id ? x : {
                              ...x, turnosRealizados: elegidos.includes(turno) ? elegidos.filter(v => v !== turno) : [...elegidos, turno].sort() }) }))} />{turno}</label>; })}
                      </fieldset>}

                      {t.realizadaEnTurno === false && (
                        <label className="block text-xs font-bold text-slate-400">
                          Motivo por el que no se realizó
                          <input type="text" value={t.observacion ?? ''}
                            onChange={e => setControl(prev => ({ ...prev,
                              tareasAuditadas: prev.tareasAuditadas.map(item => item.id === t.id
                                ? { ...item, observacion: e.target.value } : item) }))}
                            className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} />
                        </label>
                      )}

                      {t.realizadaEnTurno && t.mostrarFotos && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Foto Inicio (Antes)</label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => handleMediaUpload(t.id, 'fotoInicio', e.target.files[0])}
                              className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-cyan-400"
                            />
                            {t.fotoInicio && (
                              <img src={t.fotoInicio} alt="Inicio" className="mt-2 h-28 w-full object-cover rounded-lg border border-slate-700" />
                            )}
                          </div>
                          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Foto Fin (Después)</label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => handleMediaUpload(t.id, 'fotoFin', e.target.files[0])}
                              className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-cyan-400"
                            />
                            {t.fotoFin && (
                              <img src={t.fotoFin} alt="Fin" className="mt-2 h-28 w-full object-cover rounded-lg border border-slate-700" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ingresos y Calificación de Tierra 0 a 3 */}
              <div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                  <div>
                    <h3 className="text-lg font-black">Ingresos de Camiones y Calificación de Arcilla (0 al 3)</h3>
                    <p className={`text-xs ${themeClasses.subtext}`}>Registre viajes recibidos, toneladas pesadas en báscula y calidad por componentes.</p>
                  </div>
                  <button
                    onClick={() => {
                      setNuevoIngresoExtra({ origen: canteras[0]?.nombre || "Cantera del Chañar", destino: stockPlaya[0]?.nombre || "Acopio Mezcla Principal", volumenTon: 0, observacion: "" });
                      setModalIngresoExtraAbierto(true);
                    }}
                    className="px-3.5 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-500/30 transition-colors cursor-pointer"
                  >
                    <Icons.Plus /> <span>+ Añadir Ingreso No Planificado</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {control.ingresos.map((ing) => (
                    <div key={ing.id} className={`${themeClasses.cardSecondary} p-5 rounded-2xl border space-y-3`}>
                      <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                          <h4 className="font-black text-base text-white">{ing.origen}</h4>
                          <p className="text-xs text-slate-400">Destino: <strong>{ing.destino}</strong></p>
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-xs font-black">
                            <span>¿Ingresaron viajes?</span>
                            <select value={ing.ingresaronViajes === null ? 'pendiente' : String(ing.ingresaronViajes)}
                              onChange={e => handleToggleIngresoViajes(ing.id,
                                e.target.value === 'pendiente' ? null : e.target.value === 'true')}
                              className={`p-2 rounded-lg ${themeClasses.input}`}>
                              <option value="pendiente">Pendiente</option><option value="true">Sí</option><option value="false">No</option>
                            </select>
                          </label>

                          {ing.ingresaronViajes && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-bold text-slate-400">Ton Reales:</label>
                              <input
                                type="number"
                                value={ing.volumenRealTon}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  setControl(prev => ({
                                    ...prev,
                                    ingresos: prev.ingresos.map(item => item.id === ing.id ? { ...item, volumenRealTon: val } : item)
                                  }));
                                }}
                                className={`w-24 p-1.5 rounded-lg text-center font-black text-cyan-400 ${themeClasses.input}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {ing.ingresaronViajes && (
                        <div className="pt-3 border-t border-slate-800 space-y-2">
                          <span className="text-[10px] font-black uppercase text-amber-400 block tracking-wider">
                            Calificación de la Tierra Recibida (0: Nulo; escala general 0-{escalaCalidad}; humedad H0-H3):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                            {caracteristicasTierra.filter(c => c.activo).map(car => {
                              const score = (ing.calidadesEvaluadas || {})[car.nombre] || 0;
                              return (
                                <div key={car.id} className="p-2 rounded-xl bg-slate-900/70 border border-slate-800 text-center">
                                  <span className="text-[10px] font-bold text-slate-300 block truncate">{car.nombre}</span>
                                  <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
                                    {Array.from({ length: car.nombre === 'Humedad' ? 4 : escalaCalidad + 1 }, (_, v) => v).map(v => (
                                      <button
                                        key={v}
                                        type="button"
                                        onClick={() => handleCambiarCalidadPuntaje(ing.id, car.nombre, v)}
                                        className={`w-5 h-5 rounded text-[10px] font-black transition-colors ${
                                          score === v ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                      >
                                        {v}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paso 3: Volumetría de Paladas */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-black">Control de Paladas y Movimientos Internos</h3>
                  <p className={`text-xs ${themeClasses.subtext}`}>
                    Acopio → Cajón 2 o cono. Cono → Cajón 1, Cajón 3 o Yerba Buena. Los consumos descuentan paladas y toneladas del cono.
                  </p>
                </div>
                <button
                  onClick={agregarMovimientoPaladas}
                  className="px-3.5 py-2 bg-cyan-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer hover:bg-cyan-400 transition-colors"
                >
                  <Icons.Plus /> <span>+ Registrar Carga de Pala</span>
                </button>
              </div>

              <div className="space-y-3">
                {control.paladasMovimientos.map((mov) => (
                  <div key={mov.id} className={`${themeClasses.cardSecondary} p-4 rounded-2xl border space-y-3`}>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase text-slate-400 mb-1">Maquinista & Pala</label>
                        <select
                          value={mov.maquinista}
                          onChange={e => actualizarMovimientoPaladas(mov.id, 'maquinista', e.target.value)}
                          className={`w-full p-2 rounded-xl font-bold text-xs ${themeClasses.input}`}
                        >
                          {control.asistencia.filter(a => a.rolReal === "Maquinista" && a.estado !== 'ausente').map(m => (
                            <option key={m.id} value={m.operario} className="text-slate-900">{m.operario} ({m.maquinaReal})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase text-slate-400 mb-1">Origen</label>
                        <select
                          value={mov.origen}
                          onChange={e => actualizarMovimientoPaladas(mov.id, 'origen', e.target.value)}
                          className={`w-full p-2 rounded-xl font-bold text-xs text-amber-400 ${themeClasses.input}`}
                        >
                          <optgroup label="Acopios en Playa">
                            {stockPlaya.map(a => <option key={a.id} value={a.nombre} className="text-slate-900">{a.nombre}</option>)}
                          </optgroup>
                          <optgroup label="Silos">
                            {stockSilos.filter(s => s.activo).map(s => <option key={s.id} value={s.nombre} className="text-slate-900">{s.nombre}</option>)}
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase text-slate-400 mb-1">Destino Habilitado</label>
                        <select
                          value={mov.destino}
                          onChange={e => actualizarMovimientoPaladas(mov.id, 'destino', e.target.value)}
                          className={`w-full p-2 rounded-xl font-bold text-xs text-cyan-400 ${themeClasses.input}`}
                        >
                          {getDestinosFiltradosPorOrigen(mov.origen).map(d => (
                            <option key={d.id} value={d.nombre} className="text-slate-900">{d.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase text-slate-400 mb-1">Paladas (Cálculo Automático)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={mov.cantPaladas}
                            onChange={e => actualizarMovimientoPaladas(mov.id, 'cantPaladas', e.target.value)}
                            className={`w-20 p-2 rounded-xl text-center font-black ${themeClasses.input}`}
                          />
                          <span className="text-xs font-bold text-emerald-400 whitespace-nowrap">
                            = {mov.m3Estimados} m³ ({mov.toneladasEstimadas} Ton)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <section className={`${themeClasses.cardSecondary} border rounded-2xl p-5 space-y-4`}>
                <h4 className="font-semibold">Acumulado de conos y puesta en cero</h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{saldoConosProvisorio.filter(s => s.activo).map(s =>
                  <div key={s.id} className="rounded-xl border border-slate-600/50 p-3 text-sm"><strong className="block">{s.nombre}</strong>
                    <span>{redondear(s.toneladas)} t · {redondear(numero(s.paladasOperativas))} paladas registradas</span></div>)}</div>
                <p className="text-sm text-slate-400">Poner en cero traspasa todo el remanente al cono elegido. No cuenta como consumo de producción.</p>
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Cono a poner en cero
                  <select value={traspasoCono.origenId} onChange={e => setTraspasoCono(p => ({ ...p, origenId: e.target.value }))}
                    className={`mt-1 w-full rounded-lg p-2 ${themeClasses.input}`}><option value="">Elegir origen</option>{stockSilos.filter(s => s.activo).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
                  <label className="text-sm">Cono que recibe el remanente
                    <select value={traspasoCono.destinoId} onChange={e => setTraspasoCono(p => ({ ...p, destinoId: e.target.value }))}
                      className={`mt-1 w-full rounded-lg p-2 ${themeClasses.input}`}><option value="">Elegir destino</option>{stockSilos.filter(s => s.activo && String(s.id) !== String(traspasoCono.origenId)).map(s =>
                        <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label></div>
                {traspasoCono.origenId && <p className="text-sm">Remanente estimado: {redondear(saldoConosProvisorio.find(s => String(s.id) === traspasoCono.origenId)?.toneladas ?? 0)} t · {redondear(numero(saldoConosProvisorio.find(s => String(s.id) === traspasoCono.origenId)?.paladasOperativas))} paladas.</p>}
                <button type="button" disabled={!traspasoCono.origenId || !traspasoCono.destinoId || traspasoCono.origenId === traspasoCono.destinoId}
                  onClick={() => { const origen = saldoConosProvisorio.find(s => String(s.id) === traspasoCono.origenId);
                    if (!origen || numero(origen.toneladas) <= 0) return showToast('El origen no tiene saldo para traspasar.', 'error');
                    setControl(prev => ({ ...prev, transferenciasConos: [...(prev.transferenciasConos ?? []), {
                      id: nuevoId(), origenId: traspasoCono.origenId, destinoId: traspasoCono.destinoId,
                      motivo: 'Puesta en cero de remanente' }] }));
                    setTraspasoCono({ origenId: '', destinoId: '' }); }}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Poner en cero y traspasar</button>
                {(control.transferenciasConos ?? []).map(t => <div key={t.id} className="flex justify-between gap-2 border-t border-slate-700/60 pt-2 text-sm">
                  <span>{stockSilos.find(s => String(s.id) === String(t.origenId))?.nombre} → {stockSilos.find(s => String(s.id) === String(t.destinoId))?.nombre}</span>
                  <button type="button" onClick={() => setControl(prev => ({ ...prev, transferenciasConos: prev.transferenciasConos.filter(x => x.id !== t.id) }))} className="text-red-300 underline">Deshacer</button></div>)}
              </section>
            </div>
          )}

          {/* Paso 4: Resumen y Cierre de Auditoría */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-black">Resumen Ejecutivo de la Jornada Auditada</h3>
                <p className={`text-xs ${themeClasses.subtext}`}>Revise los indicadores consolidados antes de sincronizar con Google Sheets e impactar el inventario de acopios.</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                  <span className="text-[10px] font-black uppercase text-cyan-400">Total Ingresos</span>
                  <p className="text-2xl font-black text-white mt-1">
                    {control.ingresos.filter(i => i.ingresaronViajes).reduce((a, c) => a + Number(c.volumenRealTon || 0), 0)} <span className="text-xs text-slate-400">Ton</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-[10px] font-black uppercase text-emerald-400">Volumen Movido</span>
                  <p className="text-2xl font-black text-white mt-1">
                    {control.paladasMovimientos.reduce((a, c) => a + Number(c.m3Estimados || 0), 0)} <span className="text-xs text-slate-400">m³</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <span className="text-[10px] font-black uppercase text-amber-400">Paladas Totales</span>
                  <p className="text-2xl font-black text-white mt-1">
                    {control.paladasMovimientos.reduce((a, c) => a + Number(c.cantPaladas || 0), 0)} <span className="text-xs text-slate-400">Pal</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
                  <span className="text-[10px] font-black uppercase text-red-400">Tiempo Muerto Palas</span>
                  <p className="text-2xl font-black text-white mt-1">
                    {control.paradasMaquinas.reduce((a, c) => a + calcularMinutosParada(c.horaInicio, c.horaFin, c.continuaParada), 0)} <span className="text-xs text-slate-400">min</span>
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2">
                <p className="font-bold text-slate-200">Al confirmar esta auditoría:</p>
                <p>• Los camiones confirmados aumentarán el stock de los acopios receptores.</p>
                <p>• Los movimientos de palas descontarán del acopio de origen y cargarán al destino correspondiente (Silos o Cajón 3 en Producción).</p>
                <p>• El cierre se guardará localmente. Sheets confirmará la sincronización cuando se configure Apps Script.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer de Navegación del Wizard de Auditoría */}
        <div className="bg-slate-900 p-6 border-t border-slate-800 flex justify-between items-center">
          <button
            onClick={() => setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 1}
            className={`px-6 py-2.5 font-bold rounded-xl transition-all cursor-pointer ${currentStep === 1 ? 'opacity-0 pointer-events-none' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Paso Anterior
          </button>
          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep(prev => prev + 1)}
              className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-500 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Siguiente Paso</span>
              <Icons.ArrowRight />
            </button>
          ) : (
            <button
              onClick={finalizarAuditoria}
              disabled={isSubmitting}
              className="px-10 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black rounded-xl shadow-xl hover:from-emerald-400 hover:to-teal-400 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Icons.Check />
              <span>{isSubmitting ? "Cerrando..." : "Cerrar Auditoría y Actualizar Stock"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderReportView = () => {
    if (!reporteSeleccionado) {
      return (
        <div className={`min-h-screen ${themeClasses.bg} p-8 flex items-center justify-center`}>
          <button onClick={() => setCurrentView('dashboard')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer">Volver al Dashboard</button>
        </div>
      );
    }

    return (
      <div className={`report-print min-h-screen ${themeClasses.bg} p-4 md:p-8 flex flex-col`}>
        <div className={`max-w-5xl mx-auto w-full ${themeClasses.card} rounded-[2rem] shadow-2xl p-8 space-y-6`}>
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-black uppercase text-emerald-400 tracking-wider">Certificado de Turno • Gestión Molienda</span>
              <h2 className="text-2xl font-black mt-1">Informe Consolidado de Jornada Laboral</h2>
              <p className="text-xs text-slate-400">Fecha Auditada: {reporteSeleccionado.fecha} • Auditor: {reporteSeleccionado.auditadoPor}</p>
            </div>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 cursor-pointer"
            >
              Volver al Panel
            </button>
          </div>

          <div className={`rounded-xl border p-3 text-xs font-bold ${reporteSeleccionado.sincronizacion === 'confirmada'
            ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'}`}>
            {reporteSeleccionado.sincronizacion === 'confirmada'
              ? 'Sincronización confirmada por el servicio.'
              : 'Cierre guardado en este dispositivo; sincronización pendiente.'}
            {reporteSeleccionado.sincronizacion !== 'confirmada' && appsScriptUrl !== 'URL_AQUI' && appsScriptUrl &&
              <button type="button" className="ml-3 underline" onClick={() => sincronizarReporte(reporteSeleccionado)}>
                Reintentar envío
              </button>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-black">Total Ingresos</span>
              <p className="text-xl font-black text-cyan-400 mt-1">{reporteSeleccionado.totalToneladasIngresadas} Ton</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-black">Volumen Movido</span>
              <p className="text-xl font-black text-emerald-400 mt-1">{reporteSeleccionado.totalM3Movidos} m³</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-black">Tiempo Muerto</span>
              <p className="text-xl font-black text-red-400 mt-1">{reporteSeleccionado.totalMinutosParada} min</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-black">Cumplimiento Tareas</span>
              <p className="text-xl font-black text-amber-400 mt-1">{reporteSeleccionado.cumplimientoTareasPct}%</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <section className={`${themeClasses.cardSecondary} border rounded-xl p-5`}><h3 className="font-bold mb-3">Personal y asistencia</h3>
              <div className="space-y-2 text-sm">{(reporteSeleccionado.payload?.Personal ?? []).map((p,i) => <p key={i} className="border-b border-slate-600/30 pb-2">
                <strong>{p.operario}</strong> · {p.puestoReal} · {p.estadoAsistencia}<br/>
                <span className="text-slate-400">{p.horaInicioReal}–{p.horaFinReal}{p.observacion ? ` · ${p.observacion}` : ''}</span></p>)}</div></section>
            <section className={`${themeClasses.cardSecondary} border rounded-xl p-5`}><h3 className="font-bold mb-3">Tareas y sectores</h3>
              <div className="space-y-2 text-sm">{(reporteSeleccionado.payload?.Tareas ?? []).map((t,i) => <p key={i} className="border-b border-slate-600/30 pb-2">
                <strong>{t.accion}</strong> · {t.sector} · {(t.turnos ?? []).join(', ')}<br/>
                <span className="text-slate-400">{t.realizada ? 'Realizada' : 'No realizada'}{t.observacion ? ` · ${t.observacion}` : ''}</span></p>)}</div></section>
            <section className={`${themeClasses.cardSecondary} border rounded-xl p-5`}><h3 className="font-bold mb-3">Movimientos y consumos</h3>
              <div className="space-y-2 text-sm">{(reporteSeleccionado.payload?.Movimientos ?? []).map((m,i) => <p key={i} className="border-b border-slate-600/30 pb-2">
                {m.origen} → {m.destino} · <strong>{m.cantPaladas} paladas</strong> · {m.toneladasEstimadas} t</p>)}</div>
              <p className="mt-3 text-sm">A producción: {reporteSeleccionado.consumoProduccionTon} t · Yerba Buena: {reporteSeleccionado.despachoYBTon} t</p></section>
            <section className={`${themeClasses.cardSecondary} border rounded-xl p-5`}><h3 className="font-bold mb-3">Conos y paradas</h3>
              <div className="space-y-2 text-sm">{(reporteSeleccionado.payload?.BalanceSilos ?? []).map((s,i) => <p key={i} className="border-b border-slate-600/30 pb-2">
                {s.nombre}: {s.antesTon} + {s.entradasTon} − {s.salidasTon} = <strong>{s.finalTon} t</strong></p>)}
                <p>{(reporteSeleccionado.payload?.Paradas ?? []).length} paradas registradas · {reporteSeleccionado.totalMinutosParada} min</p></div></section>
          </div>
          {reporteSeleccionado.payload?.Turnos?.[0]?.indicacionesSemana && <section className={`${themeClasses.cardSecondary} border rounded-xl p-5`}>
            <h3 className="font-bold mb-2">Indicaciones semanales</h3><p className="whitespace-pre-wrap text-sm">{reporteSeleccionado.payload.Turnos[0].indicacionesSemana}</p></section>}
          <div className="rounded-xl border border-slate-600/50 p-4 space-y-2 text-sm">
            <strong>Informe PDF y distribución</strong>
            {reporteSeleccionado.informe?.url ? <div className="flex flex-wrap gap-3 items-center">
              <a href={reporteSeleccionado.informe.url} target="_blank" rel="noreferrer" className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white">Abrir PDF en Drive</a>
              <button type="button" disabled={reporteSeleccionado.informe.estadoEnvio === 'ENVIADO' || !destinatariosInforme.some(d => d.activo)}
                onClick={async () => { try { const result = await consultarAppsScript('sendReport', { payload: { action: 'sendReport', id: reporteSeleccionado.id } });
                    setReporteSeleccionado(prev => ({ ...prev, informe: { ...prev.informe, estadoEnvio: 'ENVIADO', enviadoA: result.enviadoA } }));
                    showToast('Informe enviado a los destinatarios configurados.'); } catch (error) { showToast(error.message, 'error'); } }}
                className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Enviar PDF por correo</button>
              <span className="text-slate-400">{reporteSeleccionado.informe.estadoEnvio === 'ENVIADO' ? `Enviado a ${reporteSeleccionado.informe.enviadoA}` : `${destinatariosInforme.filter(x => x.activo).length} destinatarios activos`}</span></div>
              : <button type="button" disabled={reporteSeleccionado.sincronizacion !== 'confirmada'}
                onClick={async () => { try { await generarInforme(reporteSeleccionado.id); showToast('PDF generado.'); } catch (error) { showToast(error.message, 'error'); } }}
                className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Generar PDF desde el cierre confirmado</button>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-700 cursor-pointer"
            >
              Imprimir / Guardar PDF
            </button>
            <button
              onClick={() => setCurrentView('planoPlaya')}
              className="px-5 py-2 bg-cyan-500 text-slate-950 font-black rounded-xl text-xs hover:bg-cyan-400 cursor-pointer"
            >
              Ver Plano de Acopios Actualizado
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCatalogos = () => {
    const configTabs = [
      { id: 'operarios', label: 'Operarios & Puestos' },
      { id: 'maquinas', label: 'Palas Cargadoras' },
      { id: 'canteras', label: 'Orígenes (Canteras)' },
      { id: 'sectores', label: 'Sectores Playa' },
      { id: 'destinos', label: 'Destinos Habilitados' },
      { id: 'acciones', label: 'Acciones de Playa' },
      { id: 'calidad', label: 'Propiedades Tierra' },
      { id: 'plano', label: 'Editor del plano' },
      { id: 'destinatarios', label: 'Informes por correo' },
      { id: 'telegram', label: 'Avisos Telegram' },
      { id: 'parametros', label: 'Densidad Ton/m³' }
    ];
    const catalogosEditables = {
      canteras: { titulo: 'Canteras y excavaciones', items: canteras, setItems: setCanteras,
        nuevo: { tipo: 'Cantera' } },
      sectores: { titulo: 'Sectores de playa', items: sectores, setItems: setSectores,
        nuevo: { cuadrante: '' } },
      destinos: { titulo: 'Destinos habilitados', items: destinosGenerales, setItems: setDestinosGenerales,
        nuevo: { tipo: 'silo', desc: '' } },
      acciones: { titulo: 'Acciones de suelo', items: accionesPlaya, setItems: setAccionesPlaya,
        nuevo: {} },
      calidad: { titulo: 'Propiedades de arcilla', items: caracteristicasTierra,
        setItems: setCaracteristicasTierra, nuevo: {} }
    };
    const catalogo = catalogosEditables[activeConfigTab];

    return (
      <div className={`min-h-screen ${themeClasses.bg} p-4 md:p-8 flex flex-col`}>
        <div className={`max-w-6xl mx-auto w-full ${themeClasses.card} rounded-[2rem] shadow-xl overflow-hidden flex flex-col flex-1`}>
          <div className="bg-slate-900 p-6 text-white flex justify-between items-center border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Icons.Settings />
              </div>
              <div>
                <h2 className="text-xl font-black">Configuración y Maestros • Gestion Molienda</h2>
                <p className="text-slate-400 text-xs font-bold">Gestión integral de operarios, máquinas, canteras y parámetros de planta</p>
              </div>
            </div>
            <button type="button" onClick={() => { setConfigDesbloqueada(false); setCurrentView('dashboard'); }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs cursor-pointer"
            >
              Bloquear y volver
            </button>
          </div>

          <div className="flex flex-wrap gap-1 p-3 bg-slate-900/60 border-b border-slate-800 text-xs font-black">
            {configTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveConfigTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${activeConfigTab === tab.id ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-8 space-y-8 overflow-y-auto flex-1">
            {activeConfigTab === 'plano' && <section className="space-y-3"><h3 className="font-bold">Edición del plano de playa</h3>
              <p className="text-sm text-slate-400">Abrí el editor con el PIN para modificar acopios, sectores, cajones, conos y límites. La vista de consulta permanece interactiva sin permitir cambios.</p>
              <button className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm" onClick={() => {
                setPinDestino('editorPlano'); setModalPinAbierto(true);
              }}>Desbloquear editor del plano</button></section>}
            {catalogo && (
              <div className="space-y-5">
                {activeConfigTab === 'calidad' && <label className="block text-sm font-bold">Escala de propiedades (excepto humedad H0-H3)
                  <select value={escalaCalidad} onChange={e => setEscalaCalidad(Number(e.target.value))}
                    className={`block mt-2 p-2 rounded-lg ${themeClasses.input}`}>
                    <option value={3}>0 a 3</option><option value={5}>0 a 5</option><option value={10}>0 a 10</option>
                  </select><span className="block text-xs font-normal mt-1 text-slate-400">Los puntajes ya registrados conservan su valor; los nuevos rangos amplían las opciones.</span>
                </label>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-3">
                  <div><h3 className="text-lg font-black">{catalogo.titulo}</h3>
                    <p className="text-xs text-slate-400">Los registros desactivados siguen disponibles en auditorías históricas.</p></div>
                  <button type="button" onClick={() => catalogo.setItems(prev => [...prev,
                    { id: nuevoId(), nombre: `Nuevo ${catalogo.titulo.slice(0, -1)}`, activo: true, ...catalogo.nuevo }])}
                    className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black flex items-center gap-2">
                    <Icons.Plus /> Agregar
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catalogo.items.map(item => (
                    <div key={item.id} className={`${themeClasses.cardSecondary} border rounded-xl p-4 space-y-3`}>
                      <div className="flex gap-2 items-center">
                        <input aria-label="Nombre" value={item.nombre ?? ''}
                          onChange={e => catalogo.setItems(prev => prev.map(x => x.id === item.id
                            ? { ...x, nombre: e.target.value } : x))}
                          className={`flex-1 min-w-0 p-2 rounded-lg text-sm ${themeClasses.input}`} />
                        <button type="button" onClick={() => catalogo.setItems(prev => prev.map(x => x.id === item.id
                          ? { ...x, activo: !x.activo } : x))}
                          className={`text-xs font-bold px-3 py-2 rounded-lg ${item.activo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>
                          {item.activo ? 'Activo' : 'Reactivar'}
                        </button>
                      </div>
                      {activeConfigTab === 'canteras' && (
                        <select value={item.tipo ?? 'Cantera'} onChange={e => catalogo.setItems(prev => prev.map(x => x.id === item.id
                          ? { ...x, tipo: e.target.value } : x))} className={`w-full p-2 rounded-lg text-xs ${themeClasses.input}`}>
                          <option>Cantera</option><option>Excavación</option>
                        </select>
                      )}
                      {activeConfigTab === 'destinos' && (
                        <div className="grid grid-cols-2 gap-2">
                          <select value={item.tipo ?? 'silo'} onChange={e => catalogo.setItems(prev => prev.map(x => x.id === item.id
                            ? { ...x, tipo: e.target.value } : x))} className={`p-2 rounded-lg text-xs ${themeClasses.input}`}>
                            <option value="silo">Silo / Cajón 2</option><option value="produccion">Producción</option>
                            <option value="externo">Despacho</option><option value="playa">Playa</option>
                          </select>
                          <input aria-label="Descripción" placeholder="Descripción" value={item.desc ?? ''}
                            onChange={e => catalogo.setItems(prev => prev.map(x => x.id === item.id
                              ? { ...x, desc: e.target.value } : x))} className={`p-2 rounded-lg text-xs ${themeClasses.input}`} />
                        </div>
                      )}
                      {activeConfigTab === 'sectores' && <input aria-label="Cuadrante" placeholder="Cuadrante"
                        value={item.cuadrante ?? ''} onChange={e => catalogo.setItems(prev => prev.map(x => x.id === item.id
                          ? { ...x, cuadrante: e.target.value } : x))}
                        className={`w-full p-2 rounded-lg text-xs ${themeClasses.input}`} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* OPERARIOS Y MATRIZ DE HABILIDADES */}
            {activeConfigTab === 'operarios' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-lg font-black">Nómina de Operarios y Matriz de Habilidades</h3>
                    <p className={`text-xs ${themeClasses.subtext}`}>Modifique nombres, habilite o deshabilite (soft-delete) y defina los puestos capacitados.</p>
                  </div>
                  <button
                    onClick={() => {
                      const nuevo = {
                        id: nuevoId(),
                        nombre: '', apellidos: '', nombres: '',
                        activo: true,
                        puestosHabilitados: ["Operario de Molienda"]
                      };
                      setOperadores(prev => [...prev, nuevo]);
                      showToast("Nuevo operario añadido.");
                    }}
                    className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icons.Plus /> <span>+ Agregar Operario</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {operadores.map((op) => (
                    <div key={op.id} className={`${themeClasses.cardSecondary} p-4 rounded-2xl border space-y-3`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="flex items-center gap-3 flex-1">
                          <label className="flex-1 text-xs">Apellido(s)
                            <input type="text" value={partesOperario(op).apellidos} onChange={e => setOperadores(prev => prev.map(o => {
                              if (o.id !== op.id) return o;
                              const apellidos = e.target.value, nombres = partesOperario(o).nombres;
                              return { ...o, apellidos, nombres, nombre: `${apellidos}, ${nombres}`.replace(/, $/, '') };
                            }))} className={`block p-2 rounded-xl text-sm font-bold w-full ${themeClasses.input}`} />
                          </label>
                          <label className="flex-1 text-xs">Nombre(s)
                            <input type="text" value={partesOperario(op).nombres} onChange={e => setOperadores(prev => prev.map(o => {
                              if (o.id !== op.id) return o;
                              const apellidos = partesOperario(o).apellidos, nombres = e.target.value;
                              return { ...o, apellidos, nombres, nombre: `${apellidos}, ${nombres}`.replace(/, $/, '') };
                            }))} className={`block p-2 rounded-xl text-sm font-bold w-full ${themeClasses.input}`} />
                          </label>
                          <button
                            type="button"
                            onClick={() => setOperadores(prev => prev.map(o => o.id === op.id ? { ...o, activo: !o.activo } : o))}
                            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${op.activo ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-500'}`}
                          >
                            {op.activo ? "Activo" : "Deshabilitado"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOperadores(prev => prev.map(o => o.id === op.id ? { ...o, activo: false } : o))}
                          title="Desactivar sin borrar el historial"
                          className="text-slate-500 hover:text-red-400 p-1.5 cursor-pointer"
                        >
                          <Icons.Trash />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5">Puestos Habilitados:</label>
                        <div className="flex flex-wrap gap-2">
                          {ROLES_OPERATIVOS.map(rol => {
                            const isCapacitado = (op.puestosHabilitados || []).includes(rol);
                            return (
                              <button
                                key={rol}
                                type="button"
                                onClick={() => {
                                  const actuales = op.puestosHabilitados || [];
                                  const nuevos = isCapacitado ? actuales.filter(r => r !== rol) : [...actuales, rol];
                                  setOperadores(prev => prev.map(o => o.id === op.id ? { ...o, puestosHabilitados: nuevos } : o));
                                }}
                                className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                  isCapacitado
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : `${themeClasses.input} opacity-60 hover:opacity-100`
                                }`}
                              >
                                {isCapacitado ? "✓ " : "+ "} {rol}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MÁQUINAS Y PALAS */}
            {activeConfigTab === 'maquinas' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h3 className="text-lg font-black">Flota de Palas Cargadoras</h3>
                  <button
                    onClick={() => {
                      const nueva = { id: nuevoId(), nombre: `Nueva Pala ${maquinas.length + 1}`, m3PorPalada: 3.0, activo: true };
                      setMaquinas(prev => [...prev, nueva]);
                      showToast("Nueva pala añadida a la flota.");
                    }}
                    className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icons.Plus /> <span>+ Agregar Pala</span>
                  </button>
                </div>
                <div className="space-y-3">
                  {maquinas.map(m => (
                    <div key={m.id} className={`${themeClasses.cardSecondary} p-4 rounded-2xl border flex items-center justify-between gap-4`}>
                      <input
                        type="text"
                        value={m.nombre}
                        onChange={e => {
                          const val = e.target.value;
                          setMaquinas(prev => prev.map(item => item.id === m.id ? { ...item, nombre: val } : item));
                        }}
                        className={`p-2 rounded-xl text-sm font-black flex-1 ${themeClasses.input}`}
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 font-bold">m³ Balde:</label>
                        <input
                          type="number"
                          step="0.1"
                          value={m.m3PorPalada}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setMaquinas(prev => prev.map(item => item.id === m.id ? { ...item, m3PorPalada: val } : item));
                          }}
                          className={`w-20 p-2 rounded-xl text-center font-bold text-xs ${themeClasses.input}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setMaquinas(prev => prev.map(item => item.id === m.id ? { ...item, activo: !item.activo } : item))}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${m.activo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}
                      >
                        {m.activo ? "Activo" : "Deshabilitado"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaquinas(prev => prev.map(item => item.id === m.id ? { ...item, activo: false } : item))}
                        title="Desactivar sin borrar el historial"
                        className="text-slate-500 hover:text-red-400 p-1.5 cursor-pointer"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeConfigTab === 'telegram' && <section className="space-y-4 max-w-2xl">
              <h3 className="text-lg font-bold">Destinatarios de avisos por Telegram</h3>
              <p className="text-sm text-slate-400">El número es solo un contacto. Cada destinatario debe iniciar el chat con el bot y facilitar su chat ID. El token del bot se configura en Apps Script, nunca aquí.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input aria-label="Nombre Telegram" placeholder="Nombre" value={nuevoTelegram.nombre} onChange={e => setNuevoTelegram(p => ({ ...p, nombre: e.target.value }))} className={`${themeClasses.input} p-2 rounded-lg`} />
                <input aria-label="Teléfono" type="tel" placeholder="Teléfono (+54...)" value={nuevoTelegram.telefono} onChange={e => setNuevoTelegram(p => ({ ...p, telefono: e.target.value }))} className={`${themeClasses.input} p-2 rounded-lg`} />
                <input aria-label="Chat ID" inputMode="numeric" placeholder="Chat ID numérico" value={nuevoTelegram.chatId} onChange={e => setNuevoTelegram(p => ({ ...p, chatId: e.target.value }))} className={`${themeClasses.input} p-2 rounded-lg`} />
                <select aria-label="Destinatario de avisos" value={nuevoTelegram.destino} onChange={e => setNuevoTelegram(p => ({ ...p, destino: e.target.value }))} className={`${themeClasses.input} p-2 rounded-lg`}>
                  <option>Todos</option><option>Turno 1 (Noche)</option><option>Turno 2 (Mañana)</option><option>Turno 3 (Tarde)</option>
                  {operadores.map(o => <option key={o.id}>{o.nombre}</option>)}
                </select>
              </div>
              <button type="button" className="bg-cyan-600 text-white rounded-lg px-4 py-2 text-sm" onClick={async () => {
                try { const data = await consultarAppsScript('saveTelegramRecipient', { payload: { action: 'saveTelegramRecipient', ...nuevoTelegram, activo: true } });
                  setDestinatariosTelegram(data.telegramDestinatarios); setNuevoTelegram({ nombre: '', telefono: '', chatId: '', destino: 'Todos' });
                  showToast('Destinatario registrado en Google Sheets.'); } catch (error) { showToast(error.message, 'error'); }
              }}>Guardar destinatario</button>
              <div className="space-y-2">{destinatariosTelegram.map(d => <div key={d.chatId} className={`${themeClasses.cardSecondary} border rounded-lg p-3 text-sm flex justify-between gap-3`}>
                <span>{d.nombre || 'Sin nombre'} · {d.telefono || 'Sin teléfono'} · chat {d.chatId} · {d.destino} · {d.activo ? 'Activo' : 'Inactivo'}</span>
                <button className="underline text-cyan-400" onClick={async () => { try { const data = await consultarAppsScript('saveTelegramRecipient', {
                  payload: { action: 'saveTelegramRecipient', ...d, activo: !d.activo } }); setDestinatariosTelegram(data.telegramDestinatarios);
                } catch (error) { showToast(error.message, 'error'); } }}>{d.activo ? 'Desactivar' : 'Activar'}</button></div>)}</div>
              <p className="text-xs text-slate-400">Para activar el envío automático: configurá MES_TELEGRAM_BOT_TOKEN en Propiedades de Apps Script, ejecutá una vez instalarAvisosTelegram y autorizá la conexión externa. Los avisos con fecha y hora sincronizados se revisan cada cinco minutos; consultá MES_TelegramEnvios para confirmar entregas.</p>
            </section>}

            {activeConfigTab === 'destinatarios' && <section className="space-y-4 max-w-2xl">
              <h3 className="text-lg font-bold">Destinatarios de informes PDF</h3>
              <p className="text-sm text-slate-400">El informe se envía únicamente al pulsar «Enviar PDF por correo» después de cerrar la jornada.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input type="email" placeholder="correo@empresa.com" value={nuevoDestinatario.email}
                  onChange={e => setNuevoDestinatario(p => ({ ...p, email: e.target.value }))} className={themeClasses.input + ' rounded-lg p-2'} />
                <input placeholder="Nombre" value={nuevoDestinatario.nombre}
                  onChange={e => setNuevoDestinatario(p => ({ ...p, nombre: e.target.value }))} className={themeClasses.input + ' rounded-lg p-2'} />
                <input placeholder="Área" value={nuevoDestinatario.area}
                  onChange={e => setNuevoDestinatario(p => ({ ...p, area: e.target.value }))} className={themeClasses.input + ' rounded-lg p-2'} />
              </div>
              <button type="button" onClick={async () => { try {
                  const data = await consultarAppsScript('saveRecipient', { payload: { action: 'saveRecipient', ...nuevoDestinatario, activo: true } });
                  setDestinatariosInforme(data.destinatarios); setNuevoDestinatario({ email: '', nombre: '', area: '' });
                  showToast('Destinatario guardado en Google Sheets.');
                } catch (error) { showToast(error.message, 'error'); } }}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Agregar destinatario</button>
              <div className="space-y-2">{destinatariosInforme.map(d => <div key={d.email} className={themeClasses.cardSecondary + ' border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-sm'}>
                <span><strong>{d.nombre || d.email}</strong> · {d.email}{d.area ? ' · ' + d.area : ''}</span>
                <button type="button" onClick={async () => { try { const data = await consultarAppsScript('saveRecipient', {
                    payload: { action: 'saveRecipient', ...d, activo: !d.activo } }); setDestinatariosInforme(data.destinatarios);
                  } catch (error) { showToast(error.message, 'error'); } }}
                  className="rounded-lg border border-slate-500 px-3 py-1">{d.activo ? 'Desactivar' : 'Activar'}</button></div>)}</div>
            </section>}

            {/* PARÁMETROS GENERALES */}
            {activeConfigTab === 'parametros' && (
              <div className="space-y-5 max-w-2xl">
                <h3 className="text-lg font-black">Densidad nominal a 10% de humedad (t/m³)</h3>
                <p className={`text-sm ${themeClasses.subtext}`}>Modelo orientativo para tierra franco arenosa: H0/H1/H2/H3 usan 0/10/15/20% de agua sobre masa seca. Densidad húmeda = densidad seca × (1 + fracción de agua), manteniendo el volumen constante. Los porcentajes son escalones de trabajo, no mediciones de esta playa: calibralos con muestras secadas en laboratorio, volumen y pesajes reales. <a className="underline text-cyan-300" target="_blank" rel="noreferrer" href="https://www.nrcs.usda.gov/sites/default/files/2022-10/Soil%20Bulk%20Density%20Moisture%20Aeration.pdf">USDA NRCS: densidad aparente</a> · <a className="underline text-cyan-300" target="_blank" rel="noreferrer" href="https://www.ars.usda.gov/research/publications/publication/?seqNo115=142046">USDA ARS: humedad gravimétrica</a>.</p>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="4"
                  value={densidadTierra}
                  onChange={e => setDensidadTierra(Math.max(0.1, Math.min(4, numero(e.target.value) || 1.5)))}
                  className={`w-full p-3 rounded-xl font-black text-lg text-cyan-400 ${themeClasses.input}`}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  {HUMEDAD_GRAVIMETRICA.map((humedad, nivel) => <div key={nivel} className="p-3 rounded-xl bg-slate-800/70 border border-slate-700">
                    <span className="block text-slate-400">H{nivel} · {humedad}% agua</span>
                    <strong className="text-cyan-300">{densidadPorHumedad(densidadTierra, nivel)} t/m³</strong>
                  </div>)}
                </div>
                <div className="border-t border-slate-700 pt-5 space-y-3">
                  <h4 className="font-black">Sincronización con Google Sheets</h4>
                  <p className="text-sm text-slate-400">El Web App lee AcopiosPlaya y los catálogos validados; los conos se concilian en MES_Inventario y cada cierre queda en MES_Auditorias. La URL publicada debe devolver JSON con ok, stock y etag.</p>
                  <div className="flex flex-wrap gap-3 text-sm"><a href={SHEET_PRINCIPAL_URL} target="_blank" rel="noreferrer" className="text-cyan-300 underline">Planilla principal</a>
                    <a href={SHEET_HISTORICA_URL} target="_blank" rel="noreferrer" className="text-cyan-300 underline">Histórico productivo</a></div>
                  <label className="block text-xs text-slate-400">URL de Apps Script
                    <input type="url" value={appsScriptUrl === 'URL_AQUI' ? '' : appsScriptUrl}
                      onChange={e => setAppsScriptUrl(e.target.value.trim())}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className={`mt-1 w-full p-3 rounded-xl ${themeClasses.input}`} />
                  </label>
                  <div className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
                    <strong>Estado: {estadoSheet.estado === 'conectado' ? `Conectada · revisión ${estadoSheet.revision}` : estadoSheet.estado === 'error' ? 'Error de conexión' : 'Sin conectar'}</strong>
                    <p className="mt-1">{estadoSheet.mensaje ?? 'Desplegá integrations/Code.gs como Web App y pegá aquí su URL /exec.'}</p>
                  </div>
                  <button type="button" onClick={cargarEstadoSheet} disabled={!appsScriptUrl || appsScriptUrl === 'URL_AQUI'}
                    className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold">Leer inventario validado</button>
                </div>
                <div className="border-t border-slate-700 pt-5 space-y-3">
                  <h4 className="font-black">Respaldo local</h4>
                  <p className="text-xs text-slate-400">Exportá el estado antes de cambiar de equipo. La importación reemplaza los datos de este navegador.</p>
                  <button type="button" onClick={() => {
                    const contenido = localStorage.getItem(STORAGE_KEY);
                    if (!contenido) return showToast('Todavía no hay datos guardados.', 'error');
                    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
                    const link = document.createElement('a'); link.href = url;
                    link.download = `gestion-molienda-${fechaLocal()}.json`; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black">Exportar JSON</button>
                  {legacyDisponible && <button type="button" className="ml-2 px-4 py-2 rounded-xl bg-slate-700 text-white text-xs font-black"
                    onClick={() => {
                      const contenido = localStorage.getItem('gestion-molienda-v1'); if (!contenido) return;
                      const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
                      const link = document.createElement('a'); link.href = url;
                      link.download = `gestion-molienda-version-anterior-${fechaLocal()}.json`; link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}>Exportar versión anterior</button>}
                  <label className="block text-xs text-slate-400">Restaurar respaldo
                    <input type="file" accept="application/json,.json" className="mt-1 block text-xs"
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try {
                          if (file.size > 8 * 1024 * 1024) throw new Error('Archivo demasiado grande');
                          const restored = JSON.parse(await file.text());
                          if (restored.version !== 2 || !Array.isArray(restored.stockPlaya) || !Array.isArray(restored.historialReportes))
                            throw new Error('Formato de respaldo inválido');
                          localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
                          window.location.reload();
                        } catch (error) { showToast(error.message, 'error'); }
                      }} />
                  </label>
                </div>
                <p className="text-xs text-amber-400">El PIN protege solo esta interfaz; no sustituye autenticación en Apps Script.</p>
                <label className="block text-xs text-slate-400">Cambiar PIN local de supervisor
                  <input type="password" inputMode="numeric" minLength="4" maxLength="12"
                    value={nuevoPin} onChange={e => setNuevoPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="Nuevo PIN de 4 a 12 dígitos"
                    className={`mt-1 w-full p-2 rounded-lg ${themeClasses.input}`} />
                </label>
                <button type="button" onClick={() => {
                  if (!/^\d{4,12}$/.test(nuevoPin)) return showToast('El PIN debe tener entre 4 y 12 dígitos.', 'error');
                  setAdminPin(nuevoPin); setNuevoPin(''); showToast('PIN local actualizado.');
                }} className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-black">
                  Guardar nuevo PIN
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${themeClasses.bg} ${darkMode ? 'mes-dark' : 'mes-light'} flex flex-col font-sans transition-colors duration-300`}>
      {toast.visible && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl font-black text-xs shadow-2xl flex items-center gap-2 ${
          toast.tipo === 'error' ? 'bg-red-600 text-white' : 'bg-cyan-500 text-slate-950'
        }`}>
          {toast.mensaje}
        </div>
      )}

      {/* Modal PIN de Configuración */}
      {modalPinAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${themeClasses.card} max-w-sm w-full p-6 rounded-3xl border shadow-2xl space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Acceso a Maestros</h3>
              <button onClick={() => { setModalPinAbierto(false); setPinInput(""); }} className="text-slate-400 hover:text-white cursor-pointer"><Icons.X /></button>
            </div>
            <p className="text-xs text-slate-400">Ingrese el PIN de supervisor para {pinDestino === 'editorPlano' ? 'editar el plano' : 'gestionar catálogos y parámetros maestros'}.</p>
            <form onSubmit={e => {
              e.preventDefault();
              if (pinInput === adminPin && adminPin.length >= 4) {
                setModalPinAbierto(false); setPinInput('');
                if (pinDestino === 'editorPlano') { setConfigDesbloqueada(true); setMapaDesbloqueado(true); setCurrentView('editorPlano'); }
                else { setConfigDesbloqueada(true); setCurrentView('catalogos'); }
              } else { showToast('PIN incorrecto. Acceso denegado.', 'error'); setPinInput(''); }
            }} className="space-y-4">
            <input
              type="password"
              placeholder="PIN de 4 a 12 dígitos"
              inputMode="numeric"
              maxLength={12}
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              className={`w-full p-3 rounded-xl text-center text-xl tracking-widest font-black ${themeClasses.input}`}
            />
            <button type="submit"
              className="w-full py-3 bg-cyan-500 text-slate-950 font-black rounded-xl text-xs cursor-pointer shadow-md"
            >
              {pinDestino === 'editorPlano' ? 'Desbloquear editor' : 'Ingresar a Configuración'}
            </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Parada de Pala */}
      {modalParadaAbierto && modalParadaData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${themeClasses.card} max-w-md w-full p-6 rounded-3xl border shadow-2xl space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-red-400 flex items-center gap-2">
                <Icons.Alert /> <span>Reportar Parada de Pala</span>
              </h3>
              <button onClick={() => { setModalParadaAbierto(false); setModalParadaData(null); }} className="text-slate-400 hover:text-white cursor-pointer"><Icons.X /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Máquina y Operario</label>
                <div className="p-2.5 rounded-xl bg-slate-800/80 font-bold text-white">
                  {modalParadaData.maquina} • {modalParadaData.maquinista}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Motivo del Desperfecto</label>
                <select
                  value={modalParadaData.motivoDesperfecto}
                  onChange={e => setModalParadaData({ ...modalParadaData, motivoDesperfecto: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  {MOTIVOS_PARADA_VALIDADOS.map(m => <option key={m} value={m} className="text-slate-900">{m}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    value={modalParadaData.horaInicio}
                    onChange={e => setModalParadaData({ ...modalParadaData, horaInicio: e.target.value })}
                    className={`w-full p-2 rounded-xl font-mono font-bold ${themeClasses.input}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Hora Fin</label>
                  <input
                    type="time"
                    disabled={modalParadaData.continuaParada}
                    value={modalParadaData.horaFin}
                    onChange={e => setModalParadaData({ ...modalParadaData, horaFin: e.target.value })}
                    className={`w-full p-2 rounded-xl font-mono font-bold ${themeClasses.input} ${modalParadaData.continuaParada ? 'opacity-30' : ''}`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={modalParadaData.continuaParada}
                    onChange={e => setModalParadaData({ ...modalParadaData, continuaParada: e.target.checked })}
                    className="w-4 h-4 rounded text-red-600"
                  />
                  <span>¿Continúa fuera de servicio?</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={modalParadaData.resuelto}
                    onChange={e => setModalParadaData({ ...modalParadaData, resuelto: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span>¿Resuelto en turno?</span>
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Observaciones Mecánicas</label>
                <input
                  type="text"
                  placeholder="Detalles de la avería, repuestos o taller..."
                  value={modalParadaData.observaciones}
                  onChange={e => setModalParadaData({ ...modalParadaData, observaciones: e.target.value })}
                  className={`w-full p-2.5 rounded-xl ${themeClasses.input}`}
                />
              </div>
            </div>

            <button
              onClick={guardarParadaModal}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl text-xs cursor-pointer shadow-md"
            >
              Guardar Reporte de Parada
            </button>
          </div>
        </div>
      )}

      {/* Modal Tarea Extra */}
      {modalTareaExtraAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${themeClasses.card} max-w-md w-full p-6 rounded-3xl border shadow-2xl space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Añadir Tarea Extra No Planificada</h3>
              <button onClick={() => setModalTareaExtraAbierto(false)} className="text-slate-400 hover:text-white cursor-pointer"><Icons.X /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Acción Realizada</label>
                <select
                  value={nuevaTareaExtra.accion}
                  onChange={e => setNuevaTareaExtra({ ...nuevaTareaExtra, accion: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  {accionesPlaya.filter(a => a.activo).map(a => <option key={a.id} value={a.nombre} className="text-slate-900">{a.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Sector Intervenido</label>
                <select
                  value={nuevaTareaExtra.sector}
                  onChange={e => setNuevaTareaExtra({ ...nuevaTareaExtra, sector: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  {sectores.filter(s => s.activo).map(s => <option key={s.id} value={s.nombre} className="text-slate-900">{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Notas / Motivo</label>
                <input
                  type="text"
                  placeholder="Justificación del trabajo imprevisto..."
                  value={nuevaTareaExtra.notas}
                  onChange={e => setNuevaTareaExtra({ ...nuevaTareaExtra, notas: e.target.value })}
                  className={`w-full p-2.5 rounded-xl ${themeClasses.input}`}
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (control.tareasAuditadas.some(t => clave(t.sector) === clave(nuevaTareaExtra.sector)))
                  return showToast('Ya hay una tarea en ese sector. Actualizá sus turnos y observaciones.', 'error');
                const nueva = {
                  id: nuevoId(),
                  accion: nuevaTareaExtra.accion,
                  sector: nuevaTareaExtra.sector,
                  realizadaEnTurno: true,
                  mostrarFotos: false,
                  fotoInicio: null,
                  fotoFin: null,
                  observacion: nuevaTareaExtra.notas,
                  esNoPlanificada: true,
                  turnosRealizados: ['T2']
                };
                setControl(prev => ({ ...prev, tareasAuditadas: [...prev.tareasAuditadas, nueva] }));
                setModalTareaExtraAbierto(false);
                showToast("Tarea extra añadida a la auditoría.");
              }}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs cursor-pointer shadow-md"
            >
              Insertar Tarea Extra
            </button>
          </div>
        </div>
      )}

      {/* Modal Ingreso Extra */}
      {modalIngresoExtraAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${themeClasses.card} max-w-md w-full p-6 rounded-3xl border shadow-2xl space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Añadir Ingreso de Tierra No Planificado</h3>
              <button onClick={() => setModalIngresoExtraAbierto(false)} className="text-slate-400 hover:text-white cursor-pointer"><Icons.X /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Origen (Cantera / Excavación)</label>
                <select
                  value={nuevoIngresoExtra.origen}
                  onChange={e => setNuevoIngresoExtra({ ...nuevoIngresoExtra, origen: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  {canteras.filter(c => c.activo).map(c => <option key={c.id} value={c.nombre} className="text-slate-900">{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Destino de descarga</label>
                <select
                  value={nuevoIngresoExtra.destino}
                  onChange={e => setNuevoIngresoExtra({ ...nuevoIngresoExtra, destino: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  {stockPlaya.map(a => <option key={a.id} value={a.nombre} className="text-slate-900">{a.nombre}</option>)}
                  <option value="Cajón 2 - Entrada Silo">Cajón 2 - Entrada Silo</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Toneladas Reales (Báscula)</label>
                <input
                  type="number"
                  min="0"
                  value={nuevoIngresoExtra.volumenTon}
                  onChange={e => setNuevoIngresoExtra({ ...nuevoIngresoExtra, volumenTon: Number(e.target.value) || 0 })}
                  className={`w-full p-2.5 rounded-xl font-black text-cyan-400 ${themeClasses.input}`}
                />
              </div>
            </div>
            <button
              onClick={() => {
                const nuevo = {
                  id: nuevoId(),
                  origen: nuevoIngresoExtra.origen,
                  destino: nuevoIngresoExtra.destino,
                  ingresaronViajes: true,
                  volumenRealTon: nuevoIngresoExtra.volumenTon,
                  calidadesEvaluadas: { Humedad: 1, Caliza: 1, Raíces: 0, Basura: 0, Piedras: 0, "Tierra Negra": 0 },
                  observacion: nuevoIngresoExtra.observacion || "Ingreso imprevisto de camión",
                  esNoPlanificado: true
                };
                setControl(prev => ({ ...prev, ingresos: [...prev.ingresos, nuevo] }));
                setModalIngresoExtraAbierto(false);
                showToast("Ingreso no planificado registrado.");
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs cursor-pointer shadow-md"
            >
              Confirmar Recepción de Camión
            </button>
          </div>
        </div>
      )}

      {/* Modal Nuevo Recordatorio */}
      {modalNuevoRecordatorioAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${themeClasses.card} max-w-md w-full p-6 rounded-3xl border shadow-2xl space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black">Crear Nuevo Recordatorio</h3>
              <button onClick={() => setModalNuevoRecordatorioAbierto(false)} className="text-slate-400 hover:text-white cursor-pointer"><Icons.X /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Destinatario</label>
                <select
                  value={nuevoRecordatorio.para}
                  onChange={e => setNuevoRecordatorio({ ...nuevoRecordatorio, para: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  <option value="Todos">Todos</option>
                  <option value="Turno 1 (Noche)">Turno 1 (Noche)</option>
                  <option value="Turno 2 (Mañana)">Turno 2 (Mañana)</option>
                  <option value="Turno 3 (Tarde)">Turno 3 (Tarde)</option>
                  {operadores.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Prioridad</label>
                <select
                  value={nuevoRecordatorio.prioridad}
                  onChange={e => setNuevoRecordatorio({ ...nuevoRecordatorio, prioridad: e.target.value })}
                  className={`w-full p-2.5 rounded-xl font-bold ${themeClasses.input}`}
                >
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Mensaje</label>
                <textarea
                  rows={3}
                  placeholder="Instrucción operativa o aviso..."
                  value={nuevoRecordatorio.texto}
                  onChange={e => setNuevoRecordatorio({ ...nuevoRecordatorio, texto: e.target.value })}
                  className={`w-full p-2.5 rounded-xl ${themeClasses.input}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs">Fecha del aviso
                <input type="date" value={nuevoRecordatorio.fechaAviso} onChange={e => setNuevoRecordatorio({ ...nuevoRecordatorio, fechaAviso: e.target.value })}
                  className={`block w-full p-2 rounded-lg ${themeClasses.input}`} /></label>
                <label className="text-xs">Hora (opcional)
                  <input type="time" disabled={!nuevoRecordatorio.fechaAviso} value={nuevoRecordatorio.horaAviso}
                    onChange={e => setNuevoRecordatorio({ ...nuevoRecordatorio, horaAviso: e.target.value })}
                    className={`block w-full p-2 rounded-lg ${themeClasses.input}`} /></label></div>
            </div>
            <button
              onClick={async () => {
                if (!nuevoRecordatorio.texto.trim()) return;
                const nuevo = {
                  id: nuevoId(),
                  fecha: fechaLocal(),
                  ...nuevoRecordatorio,
                  completado: false
                };
                setRecordatorios(prev => [nuevo, ...prev]);
                setModalNuevoRecordatorioAbierto(false);
                setNuevoRecordatorio({ para: "Todos", texto: "", prioridad: "normal", fechaAviso: '', horaAviso: '' });
                try { await consultarAppsScript('saveReminder', { payload: { action: 'saveReminder', ...nuevo } });
                  setRecordatorios(prev => prev.map(r => r.id === nuevo.id ? { ...r, sincronizado: true,
                    estadoTelegram: nuevo.fechaAviso && nuevo.horaAviso ? 'PENDIENTE' : 'SIN_FECHA' } : r));
                  showToast('Recordatorio guardado en Google Sheets.'); }
                catch (error) { showToast('Aviso local, sin Telegram: ' + error.message, 'error'); }
              }}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs cursor-pointer shadow-md"
            >
              Publicar en Pizarrón
            </button>
          </div>
        </div>
      )}

      {currentView !== 'dashboard' && currentView !== 'welcome' && <nav className="mes-topbar" aria-label="Navegación principal">
        <button type="button" className="mes-topbar-brand" onClick={() => setCurrentView('dashboard')}>
          <span className="mes-topbar-mark"><Icons.Factory /></span><strong>GESTIÓN MOLIENDA</strong><span className="mes-topbar-location">/ CEVIL POZO</span>
        </button>
        <div className="mes-topbar-links">
          {[['dashboard', 'Panel'], ['planning', 'Plan'], ['planoPlaya', 'Plano'], ['balanceSilos', 'Silos'], ['conciliacion', 'Conciliar'], ['datosValidados', 'Datos'], ['clima', 'Clima'], ['historico', 'Histórico'], ['recordatorios', 'Pizarrón'], ['asistente', 'Ayuda']].map(([vista, nombre]) =>
            <button key={vista} type="button" aria-current={currentView === vista ? 'page' : undefined}
              onClick={() => { setCurrentView(vista); if (vista === 'planning') setCurrentStep(1); }}>{nombre}</button>)}
        </div>
        <button type="button" className="mes-topbar-config" onClick={() => { setPinDestino('catalogos'); setModalPinAbierto(true); }} aria-label="Configuración"><Icons.Settings /></button>
      </nav>}
      {/* Ruteador de Vistas */}
      {currentView === 'welcome' && renderWelcome()}
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'planning' && renderPlanning()}
      {currentView === 'planoPlaya' && renderPlanoPlaya()}
      {currentView === 'editorPlano' && (configDesbloqueada && mapaDesbloqueado ? renderPlanoPlaya(true) : <div className="p-8"><button className="px-4 py-2 bg-cyan-600 text-white rounded-xl" onClick={() => { setPinDestino('editorPlano'); setModalPinAbierto(true); }}>🔒 Desbloquear editor del plano</button></div>)}
      {currentView === 'clima' && renderClimaView()}
      {currentView === 'balanceSilos' && renderBalanceSilos()}
      {currentView === 'conciliacion' && renderConciliacion()}
      {currentView === 'datosValidados' && renderDatosValidados()}
      {currentView === 'historico' && renderHistorico()}
      {currentView === 'recordatorios' && renderRecordatoriosView()}
      {currentView === 'asistente' && renderAsistente()}
      {currentView === 'catalogos' && (configDesbloqueada ? renderCatalogos() : <div className="p-8"><button className="px-4 py-2 bg-cyan-600 rounded-xl text-white" onClick={() => { setPinDestino('catalogos'); setModalPinAbierto(true); }}>🔒 Desbloquear configuración</button></div>)}
      {currentView === 'control' && renderControl()}
      {currentView === 'reportView' && renderReportView()}
    </div>
  );
};

export default App;
