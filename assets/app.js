/* CGRSA site behaviour: renders the lists in data.js. No need to edit. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (n) => String(n || "?").trim().split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).join("").slice(0, 4).toUpperCase() || "?";
  const tba = (v) => (v ? esc(v) : '<span class="tbd">To be announced</span>');
  const img = (src, alt, fallback) => src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(fallback)}'}))">` : `<span>${esc(fallback)}</span>`;
  const person = (p) => `<div class="person"><div class="ph">${img(p.photo, p.name, initials(p.name))}</div><div><b>${tba(p.name)}</b><small>${esc(p.role || p.post || p.discipline || "")}</small></div></div>`;

  // year + reveal
  document.querySelectorAll(".yr").forEach((e) => (e.textContent = new Date().getFullYear()));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.1 });
  const observe = () => document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));

  // hero speed lines
  const L = $("#lines");
  if (L) for (let i = 0; i < 14; i++) { const s = document.createElement("span"); s.style.top = Math.random() * 100 + "%"; s.style.width = 80 + Math.random() * 220 + "px"; s.style.animationDelay = Math.random() * 3.2 + "s"; s.style.animationDuration = 2.2 + Math.random() * 2.5 + "s"; L.appendChild(s); }

  // hero slideshow: crossfade + alternate zoom in / zoom out
  const HB = $("#hero-bg");
  if (HB) {
    const slides = [...HB.querySelectorAll(".slide")];
    let i = 0;
    if (slides.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(() => {
      const prev = slides[i]; i = (i + 1) % slides.length; const next = slides[i];
      next.classList.toggle("zoom-out", i % 2 === 1);
      next.classList.add("on");
      setTimeout(() => prev.classList.remove("on", "zoom-out"), 1800);
    }, 6000);
  }

  // discipline heads
  const H = $("#heads");
  if (H && typeof DISCIPLINE_HEADS !== "undefined") H.innerHTML = DISCIPLINE_HEADS.map((h) => person({ ...h, role: h.discipline + " Head" })).join("");

  // districts
  const D = $("#districts");
  if (D && typeof DISTRICTS !== "undefined") D.innerHTML = DISTRICTS.map((d) => `
    <div class="panel reveal">
      <div class="org-card"><div class="org-logo">${img(d.logo, d.name + " logo", initials(d.name))}</div>
        <div><span class="tag">${esc(d.district)} District</span><h3 style="margin-top:8px">${esc(d.name)}</h3>
          <div class="meta">${d.phone ? `<span>📞 <a href="tel:${esc(d.phone)}">${esc(d.phone)}</a></span>` : ""}${d.email ? `<span>✉️ <a href="mailto:${esc(d.email)}">${esc(d.email)}</a></span>` : ""}</div></div></div>
      <div class="people">${d.bearers.length ? d.bearers.map(person).join("") : person({ name: "", post: "Office bearers" })}</div>
    </div>`).join("");

  // clubs
  const C = $("#clubs");
  if (C && typeof CLUBS !== "undefined") {
    const draw = (dist) => {
      const list = CLUBS.filter((c) => !dist || c.district === dist);
      C.innerHTML = list.length ? list.map((c) => `
        <div class="panel reveal">
          <div class="org-card"><div class="org-logo">${img(c.logo, c.name + " logo", initials(c.name))}</div>
            <div>${c.district ? `<span class="tag">${esc(c.district)}</span>` : ""}<h3 style="margin-top:8px">${esc(c.name)}</h3>
              <div class="meta">${c.venue ? `<span>📍 ${esc(c.venue)}</span>` : ""}${c.disciplines && c.disciplines.length ? `<span>🛼 ${c.disciplines.map(esc).join(", ")}</span>` : ""}${c.contact ? `<span>👤 ${esc(c.contact)}${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}</span>` : ""}${c.since ? `<span>Affiliated since ${esc(c.since)}</span>` : ""}</div></div></div>
          ${(c.coaches || []).length ? `<div class="people">${c.coaches.map((p) => person({ ...p, role: p.role || "Coach" })).join("")}</div>` : ""}
        </div>`).join("") : `<div class="empty" style="grid-column:1/-1">The club directory is being updated. Is your club affiliated with CGRSA? <a href="join.html#club" style="color:var(--saffron-2)">Send your club details</a>.</div>`;
      observe();
    };
    const F = $("#club-filter");
    const dists = [...new Set(CLUBS.map((c) => c.district).filter(Boolean))].sort();
    if (F) { F.innerHTML = ['<button class="on" data-d="">All districts</button>', ...dists.map((d) => `<button data-d="${esc(d)}">${esc(d)}</button>`)].join("");
      F.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; F.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); draw(b.dataset.d); }; }
    draw("");
  }

  // coaches grid
  const CO = $("#coaches");
  if (CO && typeof COACHES !== "undefined") CO.innerHTML = COACHES.map((c, i) => `
    <div class="coach reveal">
      <div class="coach-ph"><img src="${esc(c.photo)}" alt="${esc(c.name || "Coach " + (i + 1))}" loading="lazy"></div>
      <h4>${c.name ? esc(c.name) : `<span class="tbd" style="font-size:.95rem">Coach ${i + 1}</span>`}</h4>
      <span class="coach-role">${esc(c.role || "Coach")}</span>${c.area ? `<small>📍 ${esc(c.area)}</small>` : ""}${c.club ? `<small>${esc(c.club)}</small>` : ""}
    </div>`).join("");

  // gallery (full page + home teaser)
  const G = $("#gallery");
  if (G && typeof GALLERY !== "undefined") {
    const limit = +G.dataset.limit || 0;
    const evs = GALLERY.filter((e) => !limit || e.photos.length).slice(0, limit || undefined);
    G.innerHTML = evs.map((e) => `
      <div class="gal-event reveal">
        <div class="gal-head"><h3>${esc(e.title)}</h3>${e.year ? `<span class="tag">${esc(e.year)}</span>` : ""}</div>
        ${e.photos.length ? `<div class="gal-grid">${e.photos.slice(0, 4).map((p, i) => `<button data-src="assets/gallery/${esc(p)}" aria-label="Open photo ${i + 1} of ${esc(e.title)}"><img src="assets/gallery/${esc(p)}" alt="${esc(e.title)} ${esc(e.year || "")}, photo ${i + 1}" loading="lazy"></button>`).join("")}</div>` : `<div class="empty">Photos are being added.</div>`}
      </div>`).join("");
    const LB = $("#lightbox");
    G.onclick = (e) => { const b = e.target.closest("button[data-src]"); if (!b || !LB) return; LB.querySelector("img").src = b.dataset.src; LB.classList.add("open"); };
    if (LB) { LB.onclick = () => LB.classList.remove("open"); document.addEventListener("keydown", (e) => e.key === "Escape" && LB.classList.remove("open")); }
  }

  // results
  const RS = $("#results");
  if (RS && typeof RESULTS !== "undefined") {
    const AG = ["06 TO 08","08 TO 10","10 TO 12","12 TO 15","15 TO 18","ABOVE 18"];
    const ageLabel = (a) => a.startsWith("ABOVE") ? "Above 18 years" : a.split(" TO ").map(Number).join(" to ") + " years";
    const M = { 5: ["g", "Gold"], 3: ["s", "Silver"], 1: ["b", "Bronze"] };
    const table = (k, d) => AG.flatMap((a) => ["Boys", "Girls"].map((g) => {
      const rows = d.rows.filter((r) => r.age === a && r.gender === g);
      if (!rows.length) return "";
      return `<div class="res-group"><h4>${g} · ${ageLabel(a)} <small>${rows.length} skaters</small></h4><div class="res-scroll"><table class="res-table"><thead><tr><th>#</th><th class="l">Skater name</th>${d.races.map((r) => `<th>${esc(r)}</th>`).join("")}<th>Total points</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(r.name)}</td>${r.pts.map((p) => M[p] ? `<td><span class="medal ${M[p][0]}">${M[p][1]}</span></td>` : `<td class="res-dash">–</td>`).join("")}<td class="tot">${esc(r.total)}</td></tr>`).join("")}</tbody></table></div></div>`;
    })).join("");
    RS.innerHTML = RESULTS.map((ev, n) => `
      <div class="res-event reveal">
        <span class="tag">State Championship</span>
        <h2>${esc(ev.title)}</h2>
        <div class="res-meta"><span>📍 <b>Venue:</b> ${esc(ev.venue)}</span><span>📅 <b>Dates:</b> ${esc(ev.dates)}</span><span>🛼 <b>${ev.data.Quad.rows.length}</b> quad · <b>${ev.data.Inline.rows.length}</b> inline skaters</span></div>
        <div class="res-actions">${Object.entries(ev.pdfs).map(([k, f]) => `<a class="btn btn-primary" href="${esc(f)}" target="_blank" rel="noopener">${k} Results (PDF) ↓</a>`).join("")}</div>
        <div class="tabs" data-ev="${n}">${Object.keys(ev.data).map((k, i) => `<button class="${i ? "" : "on"}" data-k="${k}">${k} Results</button>`).join("")}</div>
        ${Object.entries(ev.data).map(([k, d], i) => `<div class="tabpane${i ? "" : " on"}" data-ev="${n}" data-k="${k}">${table(k, d)}</div>`).join("")}
        <div class="res-legend">Points: <span class="medal g">Gold</span> = 5 <span class="medal s">Silver</span> = 3 <span class="medal b">Bronze</span> = 1</div>
      </div>`).join("");
    RS.addEventListener("click", (e) => { const b = e.target.closest(".tabs button"); if (!b) return; const n = b.parentElement.dataset.ev;
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      RS.querySelectorAll(`.tabpane[data-ev="${n}"]`).forEach((p) => p.classList.toggle("on", p.dataset.k === b.dataset.k)); });
  }

  // careers
  const O = $("#openings");
  if (O && typeof OPENINGS !== "undefined") O.innerHTML = OPENINGS.length
    ? `<table class="careers"><thead><tr><th>Role</th><th>Location</th><th>Type</th><th>Apply by</th><th></th></tr></thead><tbody>${OPENINGS.map((o) => `<tr><td><b>${esc(o.role)}</b>${o.details ? `<br><small class="tbd">${esc(o.details)}</small>` : ""}</td><td>${esc(o.location)}</td><td>${esc(o.type)}</td><td>${esc(o.lastDate)}</td><td><a class="btn btn-ghost" style="padding:8px 16px" href="mailto:cgsrsa@gmail.com?subject=${encodeURIComponent("Application: " + o.role)}">Apply</a></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">There are no openings right now. Send your CV to <a href="mailto:cgsrsa@gmail.com?subject=Career%20interest" style="color:var(--saffron-2)">cgsrsa@gmail.com</a> and we'll contact you when a role opens.</div>`;

  // join tabs
  const T = $("#join-tabs");
  if (T) {
    const show = (id) => { T.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === id)); document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("on", p.id === id)); };
    T.onclick = (e) => { const b = e.target.closest("button"); if (b) { show(b.dataset.t); history.replaceState(null, "", "#" + b.dataset.t); } };
    show(["club", "coach", "district"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "club");
  }
  // application forms → prefilled email to CGRSA office
  document.querySelectorAll("form.apply").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const lines = [...new FormData(f).entries()].map(([k, v]) => `${k}: ${v}`);
    const subj = `${f.dataset.kind} affiliation application`;
    location.href = `mailto:cgsrsa@gmail.com?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(lines.join("\n") + "\n\n(Please attach the documents listed on the website.)")}`;
  }));

  observe();
})();
