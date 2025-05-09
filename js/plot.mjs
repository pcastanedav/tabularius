import * as a from '@mitranim/js/all.mjs'
import Plot from 'https://esm.sh/uplot@1.6.27'
import {E} from './util.mjs'
import * as u from './util.mjs'
import * as c from '../funs/codes.mjs'
import * as s from '../funs/schema.mjs'
import * as ui from './ui.mjs'
import * as fs from './fs.mjs'
import * as d from './dat.mjs'

import * as self from './plot.mjs'
const tar = window.tabularius ??= a.Emp()
tar.p = self
tar.c = c
tar.s = s
a.patch(window, tar)

document.head.append(E(`link`, {
  rel: `stylesheet`,
  href: `https://esm.sh/uplot@1.6.27/dist/uPlot.min.css`,
}))

cmdPlot.cmd = `plot`
cmdPlot.desc = `analyze data, visualizing with a plot 📈📉`

// TODO: use `<details>` to collapse sections.
cmdPlot.help = function cmdPlotHelp() {
  return u.LogParagraphs(
    u.callOpt(cmdPlot.desc),
    `build your query by clicking the buttons below!`,

    [
      BtnAppend(`-c`),
      ` -- use cloud data; may require `,
      os.BtnCmdWithHelp(`auth`),
      `; the default is to use local data, which requires `,
      os.BtnCmdWithHelp(`init`),
      ` to grant access to the history directory`,
    ],

    u.LogLines(
      [BtnAppend(`-p`), ` -- preset; supported values:`],
      ...a.map(a.entries(PLOT_PRESETS), Help_preset).map(u.indentChi),
    ),

    u.LogLines(
      [
        BtnAppend(`-x`),
        ` -- X axis (progress); supported values:`,
      ],
      ...a.map(a.keys(s.ALLOWED_X_KEYS), Help_X).map(u.indentChi),
    ),

    u.LogLines(
      [
        BtnAppend(`-y`),
        ` -- Y axis (stat type); supported values:`,
      ],
      ...a.map(a.keys(s.ALLOWED_STAT_TYPE_FILTERS), Help_Y).map(u.indentChi),
    ),

    u.LogLines(
      [
        BtnAppend(`-z`),
        ` -- Z axis (plot series); supported values:`,
      ],
      ...a.map(a.keys(s.ALLOWED_Z_KEYS), Help_Z).map(u.indentChi),
    ),

    u.LogLines(
      [
        BtnAppend(`-a`),
        ` -- aggregation mode; supported values:`,
      ],
      ...FlagAppendBtns(s.AGGS, `-a`, DEFAULT_AGG).map(u.indentChi),
    ),

    u.LogLines(
      `supported filters:`,
      ...a.map(a.keys(s.ALLOWED_FILTER_KEYS), Help_filter).map(u.indentChi),
    ),

    u.LogLines(
      [`tip: repeat a filter to combine via logical "OR"; examples:`],
      [`  `, BtnAppend(`runNum=1 runNum=2`), ` -- first and second runs`],
      [`  `, BtnAppend(`roundNum=1 roundNum=2`), ` -- first and second rounds`],
    ),

    `tip: try ctrl+click / cmd+click / shift+click on plot labels`,
    [`tip: use `, os.BtnCmdWithHelp(`ls /`), ` to browse local runs`],
    [`tip: use `, os.BtnCmdWithHelp(`ls -c`), ` to browse cloud runs`],

    u.LogLines(
      `more examples:`,
      [`  `, BtnAppend(`-c userId=all`)],
      [`  `, BtnAppend(`-c userId=all -z=userId`)],
    ),
  )
}

export function cmdPlot({sig, args}) {
  args = u.stripPreSpaced(args, cmdPlot.cmd)
  if (!args) return cmdPlot.help()

  const inp = plotDecodeCliArgs(args)
  const cloud = u.dictPop(inp, `cloud`)

  if (cloud) return cmdPlotCloud(sig, inp, args)
  return cmdPlotLocal(sig, inp, args)
}

export async function cmdPlotLocal(sig, inp, args) {
  const opt = s.validPlotAggOpt(inp)
  const {Z: Z_key, X: X_key, agg} = opt
  await d.datLoad(sig, d.DAT, opt)

  const opts = plotOpts()
  if (isPlotDataEmpty(opts.data)) return msgPlotDataEmpty(args)

  ui.MEDIA.add(new LivePlotter(opts, plotOpts))

  // TODO: on `DAT` events, don't update the plot if unaffected.
  function plotOpts() {
    const facts = d.datQueryFacts(d.DAT, opt)
    const data = s.plotAggFromFacts({facts, opt})
    return plotOptsWith({...data, inp})
  }
}

export async function cmdPlotCloud(sig, inp, args) {
  u.reqSig(sig)
  a.reqDict(inp)
  a.reqDict(inp.where)

  const fb = await import(`./fb.mjs`)

  if (inp.userCurrent && !await fb.nextUser(sig)) {
    throw new u.ErrLog(
      `filtering cloud data by current user requires authentication; run the `,
      os.BtnCmdWithHelp(`auth`),
      ` command; alternatively, use `,
      BtnAppend(`userId=all`),
    )
  }

  const {data} = await u.wait(sig, fb.fbCall(`plotAgg`, inp))
  if (isPlotAggEmpty(data)) return msgPlotDataEmpty(args)
  ui.MEDIA.add(new Plotter(plotOptsWith({...consistentNil(data), inp})))
}

export function plotOptsWith({X_row, Z_labels, Z_X_Y, inp}) {
  a.reqArr(X_row)
  a.reqArr(Z_labels)
  a.reqArr(Z_X_Y)
  a.reqDict(inp)

  const agg = s.AGGS.get(inp.agg)
  const Z_rows = a.map(Z_labels, codedToTitled).map((val, ind) => serieWithAgg(val, ind, agg))

  // Hide the total serie by default.
  // TODO: when updating a live plot, preserve series show/hide state.
  if (Z_rows[0]) Z_rows[0].show = false

  const title = (
    inp.Z === `statType`
    ? `${inp.agg} per ${inp.Z} per ${inp.X}`
    : `${inp.agg} of ${inp.Y} per ${inp.Z} per ${inp.X}`
  )

  return {
    ...LINE_PLOT_OPTS,
    plugins: plugins(),
    // TODO human readability.
    title,
    series: [{label: inp.X}, ...Z_rows],
    data: [X_row, ...a.arr(Z_X_Y)],
    axes: axes(inp.X, inp.Y),
  }
}

/*
Converts CLI args to a format suitable for the cloud function `plotAgg` or its
local equivalent. This is an intermediary data format suitable for JSON for
cloud function calls. See `s.validPlotAggOpt` which validates and converts this
to the final representation used by querying functions.
*/
export function plotDecodeCliArgs(src) {
  src = u.stripPreSpaced(src, cmdPlot.cmd)
  const out = a.Emp()
  out.where = a.Emp()

  for (let [key, val] of plotCliDecodeWithPresets(src)) {
    if (key === `-c`) {
      out.cloud = u.cliBool(key, val)
      continue
    }

    if (key === `-x`) {
      out.X = reqEnum(key, val, s.ALLOWED_X_KEYS)
      continue
    }

    if (key === `-y`) {
      out.Y = reqEnum(key, val, s.ALLOWED_STAT_TYPE_FILTERS)
      continue
    }

    if (key === `-z`) {
      out.Z = reqEnum(key, val, s.ALLOWED_Z_KEYS)
      continue
    }

    if (key === `-a`) {
      out.agg = reqEnum(key, val, s.AGGS)
      continue
    }

    if (!key) {
      throw Error(`plot args must be one of: "-flag", "-flag=val", or "field=val", got ${a.show(val)}`)
    }

    if (!s.ALLOWED_FILTER_KEYS.has(key)) {
      throw new u.ErrLog(
        `plot filters must be among: `,
        ...u.LogWords(
          ...a.map(a.keys(s.ALLOWED_FILTER_KEYS), BtnAppendEq),
        ),
        `, got: `, key, `=`,
      )
    }

    if (key === `userId`) {
      out.userCurrent ??= false
      if (val === `all`) continue
      if (val === `current`) {
        out.userCurrent = true
        continue
      }
      u.dictPush(out.where, key, val)
      continue
    }

    if (key === `runId`) {
      out.runLatest ??= false
      if (val === `all`) continue
      if (val === `latest`) {
        out.runLatest = true
        continue
      }
      u.dictPush(out.where, key, val)
      continue
    }

    if (key === `runNum`) {
      out.runLatest ??= false
      const int = a.intOpt(val)
      if (a.isNil(int)) throw Error(`${a.show(key)} must be an integer, got: ${a.show(val)}`)
      u.dictPush(out.where, key, int)
      continue
    }

    if (
      key === `diff` ||
      key === `frontierDiff` ||
      key === `roundNum`
    ) {
      const int = a.intOpt(val)
      if (a.isNil(int)) throw Error(`${a.show(key)} must be an integer, got: ${a.show(val)}`)
      u.dictPush(out.where, key, int)
      continue
    }

    if (key === `buiType`) {
      val = c.BUILDINGS_TO_CODES_SHORT[val] || val
    }
    else if (key === `buiTypeUpg`) {
      val = titledToCoded(val) || val
    }
    else if (key === `hero`) {
      val = c.COMMANDERS_TO_CODES_SHORT[val] || val
    }

    /*
    Inputs: `one=two one=three four=five`.
    Outputs: `{one: ["two", "three"], four: ["five"]}`.
    SYNC[field_pattern].
    */
    u.dictPush(out.where, key, val)
  }

  out.cloud ??= false
  out.X ||= DEFAULT_X
  out.Y ||= DEFAULT_Y
  out.Z ||= DEFAULT_Z
  out.agg ||= DEFAULT_AGG
  out.userCurrent ??= !a.len(out.userId) && out.Z !== `userId`

  out.runLatest ??= (
    !a.len(out.runId) && !a.len(out.runNum) &&
    out.Z !== `runId` && out.Z !== `runNum`
  )

  // SYNC[plot_group_ent_type_no_mixing].
  if (!a.len(out.where.entType)) {
    out.where.entType = [s.FACT_ENT_TYPE_BUI]
  }
  else if (a.len(out.where.entType) > 1 && out.Z !== `entType`) {
    throw new u.ErrLog(
      `only one `, BtnAppend(`entType=`),
      ` is allowed, unless `, BtnAppend(`-z=entType`),
    )
  }

  return out
}

export const DEFAULT_X = `roundNum`
export const DEFAULT_Y = s.STAT_TYPE_DMG_DONE
export const DEFAULT_Z = `buiTypeUpg`
export const DEFAULT_AGG = `sum`

export const PLOT_PRESETS = new Map()
  .set(`dmg`, {
    args: `-x=${DEFAULT_X} -y=${s.STAT_TYPE_DMG_DONE} -z=${DEFAULT_Z} -a=sum`,
    help: `-- default`,
  })
  .set(`eff`, {
    args: `-x=${DEFAULT_X} -y=${s.STAT_TYPE_COST_EFF} -z=${DEFAULT_Z} -a=avg`,
  })
  .set(`dmgOver`, {
    args: `-x=${DEFAULT_X} -y=${s.STAT_TYPE_DMG_OVER} -z=${DEFAULT_Z} -a=sum`,
  })
  .set(`dmgRuns`, {
    args: `-x=runNum -y=${s.STAT_TYPE_DMG_DONE} -a=sum runId=all`,
  })
  .set(`roundStats`, {
    args: `-x=${DEFAULT_X} -z=statType -a=sum`,
  })
  .set(`runStats`, {
    args: `-x=runNum -z=statType -a=sum runId=all`,
  })
  .set(`chiDmg`, {
    args: `-x=${DEFAULT_X} -z=chiType -a=sum entType=${s.FACT_ENT_TYPE_CHI}`,
  })

function plotCliDecodeWithPresets(src) {
  const out = []

  for (const pair of u.cliDecode(src)) {
    const [key, val] = pair

    if (key !== `-p`) {
      out.push(pair)
      continue
    }

    const {args} = PLOT_PRESETS.get(reqEnum(key, val, PLOT_PRESETS))
    out.push(...u.cliDecode(args))
  }
  return out
}


/*
Goal: if FS is inited and we have an actual latest run, show its analysis.
Otherwise, show a sample run for prettiness sake.
*/
export async function plotDefault({sig}) {
  try {
    if (await fs.loadedHistoryDir()) {
      await cmdPlot({sig, args: `plot runId=latest`})
      return
    }
  }
  catch (err) {
    if (u.LOG_VERBOSE) u.log.err(`error analyzing latest run: `, err)
    u.log.verb(`unable to plot latest run, plotting example run`)
  }
  await plotExampleRun()
}

export async function plotExampleRun() {
  const runId = `example_run`
  const rounds = await u.jsonDecompressDecode(await u.fetchText(
    new URL(`../data/example_run.gd`, import.meta.url)
  ))
  if (!a.len(rounds)) throw Error(`internal error: missing chart data`)

  const dat = a.Emp()
  s.datInit(dat)

  for (const round of rounds) {
    s.datAddRound({dat, round, runId, runNum: 0, userId: d.USER_ID})
  }

  const inp = plotDecodeCliArgs()
  delete inp.cloud
  const opt = s.validPlotAggOpt(inp)
  const facts = d.datQueryFacts(dat, opt)
  const data = s.plotAggFromFacts({facts, opt})
  const opts = plotOptsWith({...data, inp})

  opts.title = `example run analysis: ` + opts.title
  ui.MEDIA.add(new Plotter(opts))
}

/*
Interfaces:
  https://github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts

Source:
  https://github.com/leeoniya/uPlot/blob/master/src/uPlot.js

Demos:
  https://leeoniya.github.io/uPlot/demos/index.html

Dark mode demo:
  https://leeoniya.github.io/uPlot/demos/line-paths.html

Usage examples:

  E(document.body, {}, new pl.Plotter(opts))
  ui.MEDIA.add(new pl.Plotter(opts))
*/
export class Plotter extends u.Elem {
  constructor(opts) {
    super()
    this.opts = a.reqDict(opts)
    this.resObs = new ResizeObserver(this.onResize.bind(this))
    this.className = `block w-full`
  }

  init() {
    this.deinit()
    this.plot = new Plot({...this.opts, ...this.sizes()})
    this.appendChild(this.plot.root)
    this.resObs.observe(this)
    u.darkModeMediaQuery.addEventListener(`change`, this)
  }

  deinit() {
    u.darkModeMediaQuery.removeEventListener(`change`, this)
    this.resObs.disconnect()
    this.plot?.root?.remove()
    this.plot?.destroy()
    this.plot = undefined
  }

  connectedCallback() {
    // Need to wait a tick for the element's geometry to be determined.
    const init = () => {if (this.isConnected) this.init()}
    window.requestAnimationFrame(init)
  }

  disconnectedCallback() {this.deinit()}

  resizing = false
  onResize() {
    // Precaution against recursively triggering resize.
    if (this.resizing) return
    this.resizing = true
    const done = () => {this.resizing = false}
    window.requestAnimationFrame(done)
    this.plot?.setSize(this.sizes())
  }

  sizes() {
    return {
      width: this.offsetWidth,
      height: this.offsetWidth/(16/9), // Golden ratio.
    }
  }

  handleEvent(eve) {if (eve.type === `change` && eve.media) this.init()}
}

export class LivePlotter extends Plotter {
  constructor(opts, fun) {
    super(opts || fun())
    this.fun = a.reqFun(fun)
  }

  init() {
    super.init()
    this.unsub = u.listenMessage(d.DAT, this.onDatMsg.bind(this))
  }

  deinit() {
    this.unsub?.()
    super.deinit()
  }

  onDatMsg(src) {
    if (!this.isConnected) {
      console.error(`internal error: ${a.show(this)} received a dat event when not connected to the DOM`)
      return
    }

    const opts = this.fun(src)
    if (!opts) return

    this.opts = opts
    this.init()
  }
}

export const SCALE_X = {time: false}
export const SCALE_Y = SCALE_X
export const SCALES = {x: SCALE_X, y: SCALE_Y}

export const LINE_PLOT_OPTS = {
  axes: axes(),
  scales: SCALES,
  legend: {
    // Apply colors directly to serie labels instead of showing dedicated icons.
    markers: {show: false},

    /*
    Inverts the default behavior of clicking legend labels. By default, clicking
    a label disables it, and Ctrl+ or Cmd+clicking isolates it, disabling
    others. With the inverted behavior, clicking a label isolates that series,
    and Ctrl+ or Cmd+ clicking enables other series one by one. The default
    behavior makes it easy to disable individual series. The inverted behavior
    makes it easy to disable everything else and select a few. In our case,
    it tends to be more useful to easily disable outliers who are spoiling the
    chart, for one reason or another.

      isolate: true,
    */
  },

  /*
  TODO: more clearly indicate the currently hovered series, maybe with an outline.
  Then we don't have to make other series unreadable.
  */
  focus: {alpha: 0.3},

  cursor: {
    // When hovering near a datapoint, apply the setting `../focus/alpha`
    // to all other series.
    focus: {prox: 8},
  },
}

export const pluginSortLabels = {hooks: {setLegend: sortPlotLabels}}

export function plugins() {
  return [new TooltipPlugin().opts(), pluginSortLabels]
}

export function axes(nameX, nameY) {
  return [
    // This one doesn't have a label, not even an empty string, because that
    // causes the plot library to waste space.
    {
      scale: `x`,
      stroke: axisStroke,
      secretName: nameX,
    },
    // This one does have an empty label to prevent the numbers from clipping
    // through the left side of the container.
    {
      scale: `y`,
      label: ``,
      stroke: axisStroke,
      secretName: nameY,
    },
  ]
}

export function axisStroke() {
  return u.darkModeMediaQuery.matches ? `white` : `black`
}

export function serieWithAgg(label, ind, agg) {
  a.reqFun(agg)

  return {
    ...serie(label, ind),
    value(plot, val, ind) {
      return serieFormatVal(plot, val, ind, agg)
    },
  }
}

export function serie(label, ind) {
  a.reqValidStr(label)

  return {
    label,
    stroke: nextFgColor(ind),
    width: 2,

    /*
    When formatting series, we preserve values exactly as-is, in order to be
    able to parse them back and reorder serie DOM nodes by those values. Which
    seems like the cleanest, least invasive approach to dynamic reordering of
    series, since Uplot doesn't support that at all. See `pluginSortLabels`.
    */
    value: a.id,
  }
}

// See comment in `serie` why we don't format the value here.
export function serieFormatVal(plot, val, seriesInd, agg) {
  a.reqInt(seriesInd)
  a.reqFun(agg)
  const ind = plot.cursor.idx
  if (a.isInt(ind) && ind >= 0) return a.laxFin(val)
  return plot.data[seriesInd].reduce(agg, 0)
}

// Our default value formatter, which should be used for all plot values.
export function formatVal(val) {
  if (!a.isNum(val)) return val
  return formatNumCompact(val)
}

/*
We could also use `Intl.NumberFormat` with `notation: "compact"`.
This `k`, `kk`, `kkk` notation is experimental.
*/
export function formatNumCompact(val) {
  a.reqNum(val)
  let scale = 0
  const mul = 1000
  while (a.isFin(val) && Math.abs(val) > mul) {
    scale++
    val /= mul
  }
  return numFormat.format(val) + `k`.repeat(scale)
}

export const numFormat = new Intl.NumberFormat(`en-US`, {
  maximumFractionDigits: 1,
  roundingMode: `halfExpand`,
})

let COLOR_INDEX = -1

export function resetColorIndex() {COLOR_INDEX = -1}

export function nextFgColor(ind) {
  ind = a.optNat(ind) ?? ++COLOR_INDEX
  ind++
  ind %= FG_COLORS.length
  return FG_COLORS[ind]
}

/*
Copy-paste of `*-500` color variants from:
  https://tailwindcss.com/docs/colors#default-color-palette-reference
*/
const FG_COLORS = [
  `oklch(0.637 0.237 25.331)`,  // red
  `oklch(0.705 0.213 47.604)`,  // orange
  `oklch(0.769 0.188 70.08)`,   // amber
  `oklch(0.795 0.184 86.047)`,  // yellow
  `oklch(0.768 0.233 130.85)`,  // lime
  `oklch(0.723 0.219 149.579)`, // green
  `oklch(0.696 0.17 162.48)`,   // emerald
  `oklch(0.704 0.14 182.503)`,  // teal
  `oklch(0.715 0.143 215.221)`, // cyan
  `oklch(0.685 0.169 237.323)`, // sky
  `oklch(0.623 0.214 259.815)`, // blue
  `oklch(0.585 0.233 277.117)`, // indigo
  `oklch(0.606 0.25 292.717)`,  // violet
  `oklch(0.627 0.265 303.9)`,   // purple
  `oklch(0.667 0.295 322.15)`,  // fuchsia
  `oklch(0.656 0.241 354.308)`, // pink
  `oklch(0.645 0.246 16.439)`,  // rose
  `oklch(0.554 0.046 257.417)`, // slate
  `oklch(0.551 0.027 264.364)`, // gray
  `oklch(0.552 0.016 285.938)`, // zinc
  `oklch(0.556 0 0)`,           // neutral
  `oklch(0.553 0.013 58.071)`,  // stone
]

/*
Plugin interface:

  export interface Plugin {
    opts?: (plot: uPlot, opts: Options) => void | Options
    hooks: Hooks.ArraysOrFuncs
  }

Hooks (paraphrased):

  interface Hooks {
    init?:       func | func[]
    addSeries?:  func | func[]
    delSeries?:  func | func[]
    setScale?:   func | func[]
    setCursor?:  func | func[]
    setLegend?:  func | func[]
    setSelect?:  func | func[]
    setSeries?:  func | func[]
    setData?:    func | func[]
    setSize?:    func | func[]
    drawClear?:  func | func[]
    drawAxes?:   func | func[]
    drawSeries?: func | func[]
    draw?:       func | func[]
    ready?:      func | func[]
    destroy?:    func | func[]
    syncRect?:   func | func[]
  }

Relevant demos with tooltips:

  https://leeoniya.github.io/uPlot/demos/tooltips.html
  https://leeoniya.github.io/uPlot/demos/tooltips-closest.html
*/
export class TooltipPlugin extends a.Emp {
  // Index of currenly hovered series.
  indS = undefined

  opts() {
    return {
      hooks: {
        // Called when a cursor hovers a particular series.
        setSeries: this.setSeries.bind(this),
        // Called on any cursor movement.
        setCursor: this.draw.bind(this),
      }
    }
  }

  /*
  Known gotcha / limitation: when multiple series _overlap_ on a data point,
  either completely, or at least visually, we still select just one series,
  instead of grouping them and including all in the tooltip.
  */
  setSeries(plot, ind) {
    this.indS = ind
    this.draw(plot)
  }

  draw(plot) {
    const {indS} = this
    const indX = plot.cursor.idx
    if (a.isNil(indS) || a.isNil(indX)) {
      this.tooltip?.remove()
      return
    }

    const series = plot.series[indS]
    const valX = plot.data[0][indX]
    const valY = plot.data[indS][indX]
    const posX = plot.valToPos(valX, `x`, false)
    const posY = plot.valToPos(valY, `y`, false)

    if (!a.isFin(valX) || !a.isFin(valY) || !a.isFin(posX) || !a.isFin(posY)) {
      this.tooltip?.remove()
      return
    }

    const axisNameX = plot.axes?.[0]?.secretName || `X`
    const axisNameY = plot.axes?.[1]?.secretName || `Y`
    const nameSuf = `: `
    const nameLen = nameSuf.length + Math.max(axisNameX.length, axisNameY.length)

    const tar = this.tooltip ??= this.makeTooltip()
    const wid = plot.over.offsetWidth / 2
    const hei = plot.over.offsetHeight / 2
    const isRig = posX > wid
    const isBot = posY > hei

    tar.style.transform = `translate(${isRig ? -100 : 0}%, ${isBot ? -100 : 0}%)`
    tar.style.left = posX + `px`
    tar.style.top = posY + `px`
    tar.textContent = u.joinLines(
      series.label,
      (axisNameX + nameSuf).padEnd(nameLen, ` `) + formatVal(valX),
      (axisNameY + nameSuf).padEnd(nameLen, ` `) + formatVal(valY),
    )
    plot.over.appendChild(tar)
  }

  makeTooltip() {
    return E(`div`, {
      // TODO convert inline styles to Tailwind classes.
      style: {
        padding: `0.3rem`,
        pointerEvents: `none`,
        position: `absolute`,
        background: `oklch(0.45 0.31 264.05 / 0.1)`,
        whiteSpace: `pre`,
      },
    })
  }
}

/*
Converts labels such as `CB01_ABA` into the likes of `Bunker_ABA`. We could
generate and store those names statically, but doing this dynamically seems
more reliable, considering that new entities may be added later. Updating the
table of codes is easier than updating the data.
*/
export function codedToTitled(src) {
  const [pre, ...suf] = a.laxStr(src).split(`_`)
  return u.joinKeys(c.CODES_TO_NAMES_SHORT[pre] || pre, ...suf)
}

/*
Inverse of `codedToTitled`. Should be used to convert user-readable filters such
as `buiType=Bunker` into coded ones that match the actual fact fields.
*/
export function titledToCoded(src) {
  const [pre, ...suf] = a.laxStr(src).split(`_`)
  return u.joinKeys(c.NAMES_TO_CODES_SHORT[pre] || pre, ...suf)
}

export function sortPlotLabels(plot) {
  const body = plot.root.getElementsByTagName(`table`)?.[0]?.getElementsByTagName(`tbody`)?.[0]
  if (!body) return

  const nodes = body.children
  const len = nodes.length
  if (!len) return

  // Enables `.style.order` on child nodes.
  body.style.display = `flex`
  body.style.flexWrap = `wrap`
  body.style.justifyContent = `center`

  for (const [ind, val] of a.arr(nodes).map(labelSortable).sort(compareLabelSortable).entries()) {
    if (!val.ind) continue // Skip X label.
    val.node.style.order = ind
    labelValNode(val.node).textContent = formatVal(val.val)
  }
}

function labelSortable(node, ind) {
  const val = parseFloat(labelValNode(node).textContent)
  return {ind, val, node}
}

function labelValNode(val) {return val.childNodes[1]}

function compareLabelSortable(one, two) {return two.val - one.val}

function BtnAppend(val) {return ui.BtnPromptAppend(cmdPlot.cmd, val)}

function BtnAppendEq(key) {
  return BtnAppend(a.reqValidStr(key) + `=`)
}

function FlagAppendBtns(src, flag, def) {
  a.reqValidStr(flag)
  a.reqValidStr(def)
  return a.keys(src).map(key => [
    BtnAppend(`${flag}=${key}`),
    a.vac(key === def) && ` (default)`,
  ])
}

function Help_preset([key, {args, help}]) {
  return [
    BtnAppend(`-p=${key}`), ` -- same as `, BtnAppend(args),
    a.vac(help) && [` `, help],
  ]
}

// SYNC[plot_help_X].
function Help_X(key) {
  a.reqValidStr(key)
  const btn = BtnAppend(`-x=${key}`)

  if (key === `runNum`) {
    return [
      btn,
      ` (recommendation: `, BtnAppend(`runId=all`), `)`,
    ]
  }

  if (key === DEFAULT_X) {
    return [
      btn,
      ` (default unless `, BtnAppend(`-z=statType`), `)`,
    ]
  }

  return btn
}

function Help_Z(key) {
  a.reqValidStr(key)
  const btn = BtnAppend(`-z=${key}`)

  if (key === `userId`) {
    return [
      btn,
      ` (disables default `, BtnAppend(`userId=current`), `)`,
    ]
  }

  if (key === `runId`) {
    return [
      btn,
      ` (disables default `, BtnAppend(`runId=latest`), `)`,
    ]
  }

  if (key === `runNum`) {
    return [
      btn,
      ` (disables default `, BtnAppend(`runId=latest`), `)`,
    ]
  }

  if (key === `roundNum`) {
    return [
      btn,
      ` (recommendation: `, BtnAppend(`-x=runNum runId=all`), `)`,
    ]
  }

  if (key === `statType`) {
    // SYNC[plot_group_stat_type_no_mixing].
    return [btn, ` (disables `, BtnAppend(`-y`), `)`]
  }

  if (key === DEFAULT_Z) {
    return [btn, ` (default)`]
  }

  return btn
}

// SYNC[plot_help_filters].
function Help_Y(key) {
  a.reqValidStr(key)
  const btn = BtnAppend(`-y=${key}`)
  if (key === DEFAULT_Y) {
    return [btn, ` (default unless `, BtnAppend(`-z=statType`), `)`]
  }
  return btn
}

function Help_filter(key) {
  a.reqValidStr(key)
  const btn = BtnAppend(`${key}=`)

  if (key === `userId`) {
    return [
      btn,
      ` (default `, BtnAppend(`userId=current`),
      ` unless `, BtnAppend(`-z=userId`),
      `, disable via `, BtnAppend(`userId=all`), `)`,
    ]
  }

  if (key === `runId`) {
    return [
      btn,
      ` (default `, BtnAppend(`runId=latest`),
      ` unless `, BtnAppend(`-z=runId`), ` or `, BtnAppend(`-z=runNum`),
      `, disable via `, BtnAppend(`runId=all`), `)`,
    ]
  }

  if (key === `runNum`) {
    return [
      btn,
      ` (disables default `, BtnAppend(`runId=latest`), `)`,
    ]
  }

  if (key === `buiType`) {
    return [
      btn,
      ` (short name, like `, BtnAppend(`buiType=MedMort`), `)`,
    ]
  }

  if (key === `buiTypeUpg`) {
    return [
      btn,
      ` (short name, like `, BtnAppend(`buiTypeUpg=MedMort_ABA`), `)`,
    ]
  }

  if (key === `entType`) {
    return [
      btn,
      ` (default `, BtnAppend(`entType=${s.FACT_ENT_TYPE_BUI}`), `)`,
    ]
  }

  if (key === `hero`) {
    return [
      btn,
      ` (short name, like `, BtnAppend(`hero=Anysia`), `)`,
    ]
  }

  return btn
}

function isPlotAggEmpty({X_row, Z_labels, Z_X_Y}) {
  return isPlotDataEmpty([X_row, Z_labels, Z_X_Y])
}

/*
Our cloud function returns this as a dict, while the plot library we use
requires this as an array.
*/
function isPlotDataEmpty([X_row, Z_labels, Z_X_Y]) {
  a.optArr(X_row)
  a.optArr(Z_labels)
  a.optArr(Z_X_Y)
  return a.isEmpty(X_row)
}

function msgPlotDataEmpty(inp) {return `no data found for ` + a.show(inp)}

function reqEnum(key, val, coll) {
  if (coll.has(val)) return val

  function show(val) {return BtnAppend(key + `=` + a.renderLax(val))}

  throw new u.ErrLog(
    a.show(key), ` must be one of: `,
    ...u.LogWords(...a.map(a.keys(coll), show)),
    `, got: `, key, `=`, val,
  )
}

/*
Workaround for a problem in Uplot. Contrary to what the documentation claims,
it seems to only support missing values when they're `undefined`, but not
when they're `null`. When generating data locally, we always use `undefined`
for missing values. But when receiving plot-ready data from a cloud function,
`undefined` becomes `null` due to limitations of JSON. So we have to convert
this back.
*/
export function consistentNil(val) {
  if (a.isNil(val)) return undefined
  if (a.isArr(val)) return a.map(val, consistentNil)
  if (a.isDict(val)) return a.mapDict(val, consistentNil)
  return val
}

// For REPL convenience.
export function plotArgsToAggOpt(src) {
  src = plotDecodeCliArgs(src)
  delete src.cloud
  return s.validPlotAggOpt(src)
}
