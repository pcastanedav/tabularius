import * as hd from 'https://cdn.jsdelivr.net/npm/@mitranim/js@0.1.61/http_deno.mjs'
import * as ld from 'https://cdn.jsdelivr.net/npm/@mitranim/js@0.1.61/live_deno.mjs'
import * as h from 'https://cdn.jsdelivr.net/npm/@mitranim/js@0.1.61/http.mjs'

const PORT = 9834

const bro = new ld.LiveBroad()

const dirs = ld.LiveDirs.of(
  hd.dirRel(Deno.env.get(`TAR`) || `.`),
  hd.dirRel(`.`, /(?:^\w+[.]html$|^sw[.]mjs$|^js[/]|^data[/]|^local[/])/),
)

const liveDirs = ld.LiveDirs.of(
  hd.dirRel(`.`, /(?:^\w+[.]html$|^sw[.]mjs$|^js[/])/),
)

const dirAbs = hd.dirAbs()

Deno.serve({
  port: PORT,
  handler: respond,
  onListen({port, hostname}) {
    if (hostname === `0.0.0.0`) hostname = `localhost`
    console.log(`listening on http://${hostname}:${port}`)
  },
})

async function respond(req) {
  const rou = h.toReqRou(req)

  return ld.withLiveClient(bro.clientPath, await (
    (
      rou.url.pathname.startsWith(`/Users/`) &&
      (await dirAbs.resolveFile(rou.url.pathname))?.res()
    ) ||
    (await bro.res(rou)) ||
    (await dirs.resolveSiteFileWithNotFound(rou.url))?.res() ||
    rou.notFound()
  ))
}

/*
Causes our "live client" to reload the page on changes. See `live.mjs` and
`live.mjs`>`withLiveClient`. Also note that the directories we watch here could
be different from the directories from which we serve files, depending on how
our app works. For a SPA, the correspondence tends to be one-to-one.
*/
for await (const val of liveDirs.watchLive()) {
  bro.writeEventJson(val)
}
