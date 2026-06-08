import { NextResponse } from 'next/server'

const API_KEY = process.env.API_FOOTBALL_KEY!
const BASE = 'https://v3.football.api-sports.io'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = searchParams.get('fixture')
  if (!fixtureId) return NextResponse.json({ error: 'Missing fixture id' }, { status: 400 })

  // 10-min server cache: limits API-Football calls to ~48/day for 4 simultaneous live matches
  const res = await fetch(`${BASE}/fixtures/events?fixture=${fixtureId}`, {
    headers: { 'x-apisports-key': API_KEY },
    next: { revalidate: 600 },
  })

  if (!res.ok) return NextResponse.json({ events: [] })

  const json = await res.json()
  const events = ((json.response ?? []) as any[])
    .filter((e: any) => e.type === 'Goal' || e.type === 'Card')
    .map((e: any) => ({
      elapsed: e.time.elapsed as number,
      extra: (e.time.extra ?? null) as number | null,
      team_id: e.team.id as number,
      player: e.player.name as string,
      type: e.type as 'Goal' | 'Card',
      detail: e.detail as string,
    }))

  return NextResponse.json({ events })
}
