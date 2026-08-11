/* =============================================================
   29Bet — Casino bonus wheel prelander
   -------------------------------------------------------------
   How the wheel stays honest:
     1. A weighted draw picks the prize FIRST.
     2. A pocket displaying that amount is chosen.
     3. The wheel and ball are then animated to stop on that pocket.
   What the player sees is always what the code pays out.
   ============================================================= */
(function () {
  "use strict";

  /* -----------------------------------------------------------
     CONFIG
     ----------------------------------------------------------- */
  var WA_NUMBER  = "359878299093";      // no leading "+"
  var DEV_TOKEN  = "29bet_dev_2024";    // ?dev_token=... bypasses the one-spin lock
  var STORAGE_KEY = "29bet_used_promos";
  var DEVICE_KEY  = "29bet_device_id";

  // `weight` is the real probability weight. Promo codes encode their own value:
  // Bonus-2 {d1} 1 {rest} 9  →  Bonus-22159 = $25, Bonus-27159 = $75.
  var PRIZES = [
    { amount: 5,   promo: "Bonus-259",    weight: 60 },
    { amount: 10,  promo: "Bonus-21109",  weight: 15 },
    { amount: 15,  promo: "Bonus-21159",  weight: 12 },
    { amount: 20,  promo: "Bonus-22109",  weight: 10 },
    { amount: 25,  promo: "Bonus-22159",  weight: 7  },
    { amount: 30,  promo: "Bonus-23109",  weight: 5  },
    { amount: 50,  promo: "Bonus-25109",  weight: 2  },
    { amount: 75,  promo: "Bonus-27159",  weight: 1  },
    { amount: 100, promo: "Bonus-211009", weight: 1  }
  ];

  // 38 pockets laid out like an American wheel: two green pockets exactly
  // opposite each other (the 0 / 00 positions) and 36 red/black around them.
  // Pocket frequency roughly mirrors the weights; no two neighbours match.
  var SEGMENTS = [
    100,
    5, 15, 10, 25, 5, 30, 20, 50, 5, 10, 15, 75, 5, 20, 25, 10, 5, 30,
    100,
    5, 20, 15, 10, 25, 5, 30, 20, 10, 15, 50, 5, 25, 10, 20, 15, 100, 30
  ];
  var GREEN_POCKETS = { 0: true, 19: true };

  var SEG_COUNT = SEGMENTS.length;
  var SEG_ANGLE = 360 / SEG_COUNT;

  var SPIN_MS      = 8200;   // total spin duration
  var WHEEL_TURNS  = 5;      // clockwise turns of the wheel
  var BALL_TURNS   = 13;     // counter-clockwise turns of the ball
  var R_RIM        = 194;    // ball radius while riding the outer rim (viewBox units)
  var R_REST       = 136;    // dead centre of the track cell: (116 + 156) / 2
  var BALL_VB      = 13;     // ball diameter in viewBox units
  var DROP_START   = 0.52;   // fraction of the spin where the ball leaves the rim
  var SETTLE_START = 0.80;   // fraction where it starts rattling into a pocket

  // Half the ball's angular width once it is sitting at R_REST.
  var BALL_HALF_ANGLE = Math.atan((BALL_VB / 2) / R_REST) * 180 / Math.PI;
  // Largest off-centre landing that still keeps the WHOLE ball inside the cell,
  // with 0.7deg to spare so it never touches a fret line.
  var MAX_JITTER = Math.max(0, SEG_ANGLE / 2 - BALL_HALF_ANGLE - 0.7);

  /* -----------------------------------------------------------
     DOM
     ----------------------------------------------------------- */
  var stage     = document.querySelector(".stage");
  var wheelSvg  = document.getElementById("wheel");
  var orbit     = document.getElementById("orbit");
  var ball      = document.getElementById("ball");
  var hub       = document.getElementById("hub");
  var hubWin    = document.getElementById("hubWin");
  var spinBtn   = document.getElementById("spinBtn");
  var result    = document.getElementById("result");
  var resultAmt = document.getElementById("resultAmount");
  var promoEl   = document.getElementById("promoCode");
  var copyBtn   = document.getElementById("copyBtn");
  var waLink    = document.getElementById("waLink");
  var stickyCta = document.getElementById("stickyCta");
  var stickyWa  = document.getElementById("stickyWaLink");
  var yearEl    = document.getElementById("year");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -----------------------------------------------------------
     WHATSAPP
     ----------------------------------------------------------- */
  var ALLOWED_KEYS = ["utm_source", "utm_medium", "utm_campaign",
                      "utm_content", "utm_term", "ad_id", "adset_id"];

  function buildQueryNote() {
    var usp = new URLSearchParams(window.location.search);
    var slim = new URLSearchParams();
    ALLOWED_KEYS.forEach(function (k) {
      var v = usp.get(k);
      if (v) slim.append(k, v);
    });
    return slim.toString() ? " | " + decodeURIComponent(slim.toString()) : "";
  }

  // Both the amount and the code come from the ticket the wheel just produced,
  // so the message always matches what the player actually won.
  function buildWaLink(amount, promo) {
    var body = "مرحبًا، لقد ربحت مكافأة بقيمة $" + amount +
      " وهذا هو الكود الترويجي: " + promo + buildQueryNote();
    return "https://api.whatsapp.com/send?phone=" + WA_NUMBER +
      "&text=" + encodeURIComponent(body);
  }

  function setWaLinks(amount, promo) {
    var href = buildWaLink(amount, promo);
    if (waLink) waLink.href = href;
    if (stickyWa) stickyWa.href = href;
  }

  function track(event, params) {
    if (typeof window.fbq === "function") {
      try { window.fbq("trackCustom", event, params || {}); } catch (e) { /* noop */ }
    }
  }

  [waLink, stickyWa].forEach(function (el) {
    if (!el) return;
    el.addEventListener("click", function () {
      track("WhatsAppClick", { amount: (state.prize && state.prize.amount) || 0 });
    });
  });

  /* -----------------------------------------------------------
     UNIQUE CODE PER WIN
     The base code identifies the bonus tier so support knows the value;
     the random suffix makes every issued code one-of-a-kind, so a code
     cannot be reused or passed around.
     ----------------------------------------------------------- */
  function randomSuffix(len) {
    // Ambiguous characters (0/O, 1/I/L, 2/Z, 5/S) intentionally excluded.
    var ALPHABET = "ACDEFHJKMNPQRTUVWXY34679";
    var buf = new Uint32Array(len);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(buf);
    } else {
      for (var i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 4294967295);
    }
    var out = "";
    for (var j = 0; j < len; j++) out += ALPHABET.charAt(buf[j] % ALPHABET.length);
    return out;
  }

  function issueCode(prize) { return prize.promo + "-" + randomSuffix(6); }

  /* -----------------------------------------------------------
     DEVICE LOCK (one spin per device)
     ----------------------------------------------------------- */
  function isDevMode() {
    return new URLSearchParams(window.location.search).get("dev_token") === DEV_TOKEN;
  }

  function safeStorage(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function deviceFingerprint() {
    var raw = [
      navigator.userAgent,
      navigator.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      navigator.platform,
      navigator.hardwareConcurrency || 0
    ].join("|");
    var hash = 0;
    for (var i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function getDeviceId() {
    return safeStorage(function () {
      var id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = deviceFingerprint();
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    }, deviceFingerprint());
  }

  function getSavedPrize() {
    if (isDevMode()) return null;
    return safeStorage(function () {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return all[getDeviceId()] || null;
    }, null);
  }

  function savePrize(ticket) {
    if (isDevMode()) return;
    safeStorage(function () {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      all[getDeviceId()] = {
        amount: ticket.amount,
        promo: ticket.promo,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    });
  }

  /* -----------------------------------------------------------
     BUILD THE WHEEL (SVG)
     ----------------------------------------------------------- */
  var CX = 200, CY = 200;
  var R_OUT      = 200;   // outer edge of the numbered pockets
  var R_COLOR_IN = 156;   // inner edge of the numbered pockets
  var R_TRACK_IN = 116;   // inner edge of the grey ball track
  var R_CONE_IN  = 60;    // inner edge of the light cone (hub sits below this)
  var R_LABEL    = 178;   // centre of the numbered band

  var SVG_NS = "http://www.w3.org/2000/svg";
  var pocketEls = [];

  // Screen angle: 0deg = top, increasing clockwise.
  function polar(r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function wedgePath(i, rIn, rOut) {
    var a1 = i * SEG_ANGLE - SEG_ANGLE / 2;
    var a2 = i * SEG_ANGLE + SEG_ANGLE / 2;
    var p1 = polar(rIn, a1), p2 = polar(rOut, a1);
    var p3 = polar(rOut, a2), p4 = polar(rIn, a2);
    return "M" + p1.x + " " + p1.y +
           "L" + p2.x + " " + p2.y +
           "A" + rOut + " " + rOut + " 0 0 1 " + p3.x + " " + p3.y +
           "L" + p4.x + " " + p4.y +
           "A" + rIn + " " + rIn + " 0 0 0 " + p1.x + " " + p1.y + "Z";
  }

  function circle(r, fill, stroke, width) {
    var c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", CX);
    c.setAttribute("cy", CY);
    c.setAttribute("r", r);
    c.setAttribute("fill", fill || "none");
    if (stroke) {
      c.setAttribute("stroke", stroke);
      c.setAttribute("stroke-width", width || 1);
    }
    return c;
  }

  function buildWheel() {
    var frag = document.createDocumentFragment();

    var defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML =
      '<radialGradient id="cone" cx="38%" cy="30%" r="78%">' +
        '<stop offset="0%" stop-color="#FDFCFA"/>' +
        '<stop offset="55%" stop-color="#E4E0DA"/>' +
        '<stop offset="100%" stop-color="#BFB9B1"/>' +
      '</radialGradient>' +
      '<radialGradient id="track" cx="40%" cy="32%" r="80%">' +
        '<stop offset="0%" stop-color="#D6CFC8"/>' +
        '<stop offset="100%" stop-color="#B7AFA7"/>' +
      '</radialGradient>';
    frag.appendChild(defs);

    frag.appendChild(circle(R_OUT, "#000000"));

    // 1. Numbered pockets (outer band)
    var colorFlip = 0;
    for (var i = 0; i < SEG_COUNT; i++) {
      var fill;
      if (GREEN_POCKETS[i]) {
        fill = "#0A8A3C";
      } else {
        fill = colorFlip % 2 === 0 ? "#D10000" : "#111111";
        colorFlip++;
      }
      var pocket = document.createElementNS(SVG_NS, "path");
      pocket.setAttribute("d", wedgePath(i, R_COLOR_IN, R_OUT));
      pocket.setAttribute("fill", fill);
      pocket.setAttribute("stroke", "#000000");
      pocket.setAttribute("stroke-width", "1.2");
      pocketEls[i] = pocket;
      frag.appendChild(pocket);
    }

    // 2. Grey ball track
    for (var t = 0; t < SEG_COUNT; t++) {
      var cell = document.createElementNS(SVG_NS, "path");
      cell.setAttribute("d", wedgePath(t, R_TRACK_IN, R_COLOR_IN));
      cell.setAttribute("fill", "url(#track)");
      cell.setAttribute("stroke", "#4A443E");
      cell.setAttribute("stroke-width", "0.8");
      frag.appendChild(cell);
    }

    // 3. Light cone + rings
    frag.appendChild(circle(R_TRACK_IN, "url(#cone)", "#2B2620", 1.5));
    frag.appendChild(circle(R_COLOR_IN, null, "#000000", 1.5));
    frag.appendChild(circle(R_CONE_IN, null, "rgba(0,0,0,.25)", 1));

    // 4. Amount labels, running along the radius
    for (var n = 0; n < SEG_COUNT; n++) {
      var text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", "0");
      text.setAttribute("y", "0");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", "#FFFFFF");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "800");
      text.setAttribute("font-family", "Almarai, Arial, sans-serif");
      text.setAttribute("direction", "ltr");
      text.setAttribute("transform",
        "rotate(" + (n * SEG_ANGLE) + " " + CX + " " + CY + ") " +
        "translate(" + CX + " " + (CY - R_LABEL) + ") rotate(90)");
      text.textContent = "$" + SEGMENTS[n];
      frag.appendChild(text);
    }

    wheelSvg.appendChild(frag);
  }

  /* -----------------------------------------------------------
     CAROUSEL
     Two identical halves sliding by exactly 50% = a seamless loop.
     ----------------------------------------------------------- */
  // The first set of tiles is already in the HTML so non-JS crawlers can read
  // the game names. Clone it once to give the marquee its seamless second half.
  function buildCarousel() {
    var track = document.getElementById("gamesTrack");
    if (!track) return;

    var originals = [].slice.call(track.children);
    if (!originals.length) return;

    var frag = document.createDocumentFragment();
    for (var i = 0; i < originals.length; i++) {
      var clone = originals[i].cloneNode(true);
      clone.setAttribute("aria-hidden", "true");   // visual duplicate only
      var img = clone.querySelector("img");
      if (img) {
        img.alt = "";
        img.setAttribute("loading", "lazy");
        img.removeAttribute("fetchpriority");
      }
      frag.appendChild(clone);
    }
    track.appendChild(frag);
  }

  /* -----------------------------------------------------------
     SPIN
     ----------------------------------------------------------- */
  var state = { spinning: false, done: false, prize: null };

  // Weighted draw — this is what actually decides the prize.
  function pickPrize() {
    var total = PRIZES.reduce(function (s, p) { return s + p.weight; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < PRIZES.length; i++) {
      r -= PRIZES[i].weight;
      if (r <= 0) return PRIZES[i];
    }
    return PRIZES[0];
  }

  // Pick a pocket that DISPLAYS the amount we drew.
  function pocketForAmount(amount) {
    var matches = [];
    for (var i = 0; i < SEG_COUNT; i++) if (SEGMENTS[i] === amount) matches.push(i);
    return matches[Math.floor(Math.random() * matches.length)];
  }

  function currentRotation(el) {
    try {
      var t = getComputedStyle(el).transform;
      if (!t || t === "none") return 0;
      var m = new DOMMatrixReadOnly(t);
      return Math.atan2(m.b, m.a) * 180 / Math.PI;
    } catch (e) {
      return 0;
    }
  }

  function mod360(v) { return ((v % 360) + 360) % 360; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  var UNIT = 1;     // px per viewBox unit
  var BALL_D = 13;  // ball diameter in px

  function layoutBall() {
    var w = stage.getBoundingClientRect().width;
    UNIT = (w - 18) / 400;              // 9px gold rim on each side
    BALL_D = Math.max(9, BALL_VB * UNIT);
    ball.style.width = BALL_D + "px";
    ball.style.height = BALL_D + "px";
    ball.style.marginLeft = (-BALL_D / 2) + "px";
    ball.style.top = (w / 2 - R_RIM * UNIT - BALL_D / 2) + "px";
  }

  // Positive translateY moves the ball inward (toward the hub).
  function setBallRadius(r) {
    ball.style.transform = "translateY(" + ((R_RIM - r) * UNIT) + "px)";
  }

  function highlightPocket(index, on) {
    var el = pocketEls[index];
    if (!el) return;
    el.setAttribute("stroke", on ? "#FFD24A" : "#000000");
    el.setAttribute("stroke-width", on ? "3.5" : "1.2");
    wheelSvg.style.filter = on ? "drop-shadow(0 0 9px rgba(199,154,46,.85))" : "";
  }

  function spin() {
    if (state.spinning || state.done) return;

    var saved = getSavedPrize();
    if (saved) { showAlreadyPlayed(saved); return; }

    state.spinning = true;
    spinBtn.disabled = true;
    spinBtn.textContent = "🎡 العجلة تدور…";
    track("WheelSpin");

    var prize = pickPrize();
    var pocket = pocketForAmount(prize.amount);

    layoutBall();

    // The wheel stops at a freely chosen angle...
    var wheelStart = currentRotation(wheelSvg);
    var wheelTotal = WHEEL_TURNS * 360 + Math.random() * 360;
    var wheelEnd = wheelStart + wheelTotal;

    // ...and the ball is aimed at wherever that pocket ends up, which lands it
    // anywhere around the rim. Bounded jitter keeps the whole ball in the cell.
    var jitter = (Math.random() * 2 - 1) * MAX_JITTER;
    var ballTargetAngle = mod360(pocket * SEG_ANGLE + wheelEnd + jitter);

    var ballStart = currentRotation(orbit);
    var ballTotal = -(BALL_TURNS * 360) + (ballTargetAngle - mod360(ballStart));
    while (ballTotal > -(BALL_TURNS * 360) + 360) ballTotal -= 360;

    wheelSvg.style.animation = "none";
    wheelSvg.style.transition = "none";
    orbit.style.transition = "none";

    var duration = reducedMotion ? 900 : SPIN_MS;
    var t0 = performance.now();

    function frame(now) {
      var t = Math.min(1, (now - t0) / duration);

      // Wheel: smooth, heavy deceleration.
      wheelSvg.style.transform =
        "rotate(" + (wheelStart + wheelTotal * easeOutCubic(t)) + "deg)";

      // Ball: faster, sharper deceleration than the wheel.
      var ballAngle = ballStart + ballTotal * easeOutQuart(t);

      // Radius: rides the rim, spirals in, then rattles into a pocket.
      var r = R_RIM;
      if (t > DROP_START) {
        var u = (t - DROP_START) / (1 - DROP_START);
        r = R_RIM + (R_REST - R_RIM) * easeOutCubic(u);
      }

      if (!reducedMotion && t > SETTLE_START) {
        var v = (t - SETTLE_START) / (1 - SETTLE_START);
        var decay = Math.pow(1 - v, 2);
        // Bounce off the frets, capped so the ball's outer edge stays inside
        // the track (136 + 11 + 6.5 = 153.5 < 156), and skip sideways a little.
        // Both fade to exactly 0 at t = 1, so the resting angle stays exact.
        r += Math.abs(Math.sin(v * Math.PI * 3)) * 11 * decay;
        ballAngle += Math.sin(v * Math.PI * 4) * 6 * decay;
      }

      orbit.style.transform = "rotate(" + ballAngle + "deg)";
      setBallRadius(r);

      if (t < 1) requestAnimationFrame(frame);
      else finish(prize, pocket);
    }

    requestAnimationFrame(frame);
  }

  function finish(prize, pocket) {
    state.spinning = false;
    state.done = true;

    var ticket = { amount: prize.amount, promo: issueCode(prize) };
    state.prize = ticket;

    savePrize(ticket);
    highlightPocket(pocket, true);
    revealPrize(ticket);
    confettiBurst();
    track("WheelWin", { amount: ticket.amount, promo: ticket.promo });

    spinBtn.style.display = "none";
    settleDrift();
    result.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // A last slow creep, wheel and ball moving together — the way a real wheel
  // keeps easing round after the ball has settled.
  function settleDrift() {
    if (reducedMotion) return;
    var drift = 7 + Math.random() * 5;
    var w0 = currentRotation(wheelSvg);
    var b0 = currentRotation(orbit);
    var t0 = performance.now();
    var dur = 2600;

    (function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = easeOutCubic(t);
      wheelSvg.style.transform = "rotate(" + (w0 + drift * e) + "deg)";
      orbit.style.transform = "rotate(" + (b0 + drift * e) + "deg)";
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }

  function revealPrize(ticket) {
    hubWin.textContent = "$" + ticket.amount;
    hub.classList.add("is-won");

    resultAmt.textContent = "$" + ticket.amount;
    promoEl.textContent = ticket.promo;
    setWaLinks(ticket.amount, ticket.promo);

    result.classList.add("is-shown");
    setTimeout(function () { stickyCta.classList.add("is-shown"); }, 900);
  }

  function showAlreadyPlayed(saved) {
    state.done = true;
    state.prize = saved;

    // Park the wheel and ball on the pocket they originally won, at a random
    // spot on the rim so it does not look staged.
    var pocket = pocketForAmount(saved.amount);
    var wheelAngle = Math.random() * 360;

    layoutBall();
    wheelSvg.style.animation = "none";
    wheelSvg.style.transform = "rotate(" + wheelAngle + "deg)";
    orbit.style.transform = "rotate(" +
      mod360(pocket * SEG_ANGLE + wheelAngle + (Math.random() * 2 - 1) * MAX_JITTER) + "deg)";
    setBallRadius(R_REST);
    highlightPocket(pocket, true);

    revealPrize(saved);

    // No "you already spun on this device" message: it would tell the visitor
    // that another device gets them a second spin. A returning visitor simply
    // sees the bonus they already won, as if the page had always shown it.
    spinBtn.style.display = "none";
  }

  /* -----------------------------------------------------------
     COPY CODE
     ----------------------------------------------------------- */
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var code = promoEl.textContent.trim();
      if (!code || code === "—") return;

      function done() {
        copyBtn.textContent = "✓ تم";
        copyBtn.classList.add("is-done");
        setTimeout(function () {
          copyBtn.textContent = "نسخ";
          copyBtn.classList.remove("is-done");
        }, 1800);
      }

      function fallbackCopy() {
        var ta = document.createElement("textarea");
        ta.value = code;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  }

  /* -----------------------------------------------------------
     CONFETTI — a short burst out of the hub, sized to the wheel
     ----------------------------------------------------------- */
  function confettiBurst() {
    if (reducedMotion) return;

    var rect = stage.getBoundingClientRect();
    var W = rect.width * 1.5;
    var H = rect.height * 1.5;
    var dpr = Math.min(2, window.devicePixelRatio || 1);

    var canvas = document.createElement("canvas");
    canvas.id = "confetti";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var cx = W / 2, cy = H / 2;
    var colors = ["#C79A2E", "#B5121B", "#0A8A3C", "#E5C66A", "#F1635C", "#FFFFFF"];
    var bits = [];

    for (var i = 0; i < 44; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 2.4 + Math.random() * 4.2;
      bits.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,   // biased upward
        w: 4 + Math.random() * 4,
        h: 5 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.34,
        round: Math.random() > 0.6,
        color: colors[i % colors.length]
      });
    }

    var DURATION = 1500;
    var t0 = performance.now();

    (function frame(now) {
      var alpha = Math.max(0, 1 - (now - t0) / DURATION);
      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < bits.length; i++) {
        var b = bits[i];
        b.vy += 0.13;          // gravity
        b.vx *= 0.99;
        b.vy *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        if (b.round) {
          ctx.beginPath();
          ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
        ctx.restore();
      }

      if (alpha > 0) requestAnimationFrame(frame);
      else canvas.remove();
    })(t0);
  }

  /* -----------------------------------------------------------
     INIT
     ----------------------------------------------------------- */
  buildWheel();
  buildCarousel();
  layoutBall();
  setBallRadius(R_RIM);

  spinBtn.addEventListener("click", spin);

  // Keep the ball glued to the wheel across orientation / viewport changes.
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layoutBall();
      setBallRadius(state.done ? R_REST : R_RIM);
    }, 120);
  });

  var savedPrize = getSavedPrize();
  if (savedPrize) showAlreadyPlayed(savedPrize);

  if (isDevMode()) {
    var badge = document.createElement("div");
    badge.className = "dev-badge";
    badge.textContent = "🔧 DEV MODE — قفل الجهاز معطّل";
    document.querySelector(".site-header").appendChild(badge);
  }
})();
