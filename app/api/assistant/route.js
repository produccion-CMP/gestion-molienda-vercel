export async function POST() {
  return Response.json({ ok: false, error: 'La función de IA está desactivada.' }, { status: 410 });
}
