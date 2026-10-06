import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Gestión Molienda | Cerámica Marcos Paz", description: "Control de acopios, planificación y auditoría de materia prima" , icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
