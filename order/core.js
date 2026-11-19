/* TapDito Order: shared data layer for guest, staff and owner screens.
   Two modes:
   - live: Supabase (orders/reviews shared across every phone and tablet)
   - local: browser storage only, for building and rehearsing the demo */
(function () {
  const CFG = window.TD_CONFIG || {};
  const live = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get("r") || "bonitos").replace(/[^a-z0-9-]/gi, "").toLowerCase();

  let sb = null;
  async function client() {
    if (!live) return null;
    if (!sb) {
      const mod = await import("https://esm.sh/@supabase/supabase-js@2");
      sb = mod.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    }
    return sb;
  }

  /* ---------- local mode helpers ---------- */
  const KEY = (k) => `td_${k}_${slug}`;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(KEY(k)) || "[]"); } catch (e) { return []; } };
  const write = (k, v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch (e) {} };
  const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("td_" + slug) : null;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  const api = {
    live, slug,

    async servers() {
      const c = await client();
      if (c) {
        const { data, error } = await c.from("servers").select("id,name,photo").eq("restaurant", slug).eq("active", true).order("name");
        if (!error && data && data.length) return data;
      }
      return (CFG.demoServers && CFG.demoServers[slug]) || [];
    },

    async addOrder(o) {
      const row = { restaurant: slug, table_no: String(o.table), items: o.items, note: o.note || "", total: o.total || 0, status: "new" };
      const c = await client();
      if (c) {
        const { data, error } = await c.from("orders").insert(row).select().single();
        if (error) throw error;
        return data;
      }
      const all = read("orders");
      const rec = Object.assign({ id: uid(), created_at: new Date().toISOString(), number: all.length + 1 }, row);
      all.push(rec); write("orders", all);
      bc && bc.postMessage({ type: "orders" });
      return rec;
    },

    async orders(sinceISO) {
      const c = await client();
      if (c) {
        let q = c.from("orders").select("*").eq("restaurant", slug).order("created_at", { ascending: true });
        if (sinceISO) q = q.gte("created_at", sinceISO);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      }
      return read("orders").filter(o => !sinceISO || o.created_at >= sinceISO);
    },

    async setStatus(id, status) {
      const c = await client();
      if (c) {
        const { error } = await c.from("orders").update({ status }).eq("id", id);
        if (error) throw error;
        return;
      }
      const all = read("orders").map(o => o.id === id ? Object.assign({}, o, { status }) : o);
      write("orders", all);
      bc && bc.postMessage({ type: "orders" });
    },

    async addReview(r) {
      const row = { restaurant: slug, table_no: String(r.table || ""), server_id: r.server_id || null, server_name: r.server_name || "", rating: r.rating, comment: r.comment || "", suggestion: r.suggestion || "" };
      const c = await client();
      if (c) {
        const { error } = await c.from("reviews").insert(row);
        if (error) throw error;
        return;
      }
      const all = read("reviews");
      all.push(Object.assign({ id: uid(), created_at: r.created_at || new Date().toISOString() }, row));
      write("reviews", all);
      bc && bc.postMessage({ type: "reviews" });
    },

    async reviews(sinceISO) {
      const c = await client();
      if (c) {
        let q = c.from("reviews").select("*").eq("restaurant", slug).order("created_at", { ascending: false });
        if (sinceISO) q = q.gte("created_at", sinceISO);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      }
      return read("reviews").filter(r => !sinceISO || r.created_at >= sinceISO).reverse();
    },

    /* Calls cb() whenever orders or reviews change anywhere. */
    async watch(cb) {
      const c = await client();
      if (c) {
        c.channel("td-" + slug)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "restaurant=eq." + slug }, () => cb("orders"))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "reviews", filter: "restaurant=eq." + slug }, () => cb("reviews"))
          .subscribe();
        setInterval(() => cb("poll"), 30000); // safety net if realtime drops
        return;
      }
      bc && (bc.onmessage = (e) => cb(e.data && e.data.type));
      window.addEventListener("storage", (e) => { if (e.key && e.key.indexOf("td_") === 0) cb("storage"); });
    },

    /* Local demo only: wipe and fill a year of sample reviews so the dashboard has something to show. */
    async seedDemo(servers) {
      if (live) return false;
      const now = Date.now(), DAY = 864e5, reviews = [];
      const bias = [4.7, 4.3, 3.9, 4.5, 3.4];
      const comments = ["Very attentive, thank you!", "Food came out fast.", "Friendly and quick.", "A bit slow to refill water.", "Great recommendations.", "Took a while to get the bill."];
      const suggestions = ["More vegetarian pasta options please", "Live acoustic on Fridays", "Add a kids menu", "Brighter lights by the garden tables", "Calamansi juice by the pitcher"];
      for (let i = 0; i < 420; i++) {
        const s = servers[i % servers.length], b = bias[(i % servers.length) % bias.length];
        const rating = Math.max(1, Math.min(5, Math.round(b + (Math.random() - 0.5) * 2.2)));
        const t = new Date(now - Math.random() * 360 * DAY).toISOString();
        reviews.push({ id: uid(), created_at: t, restaurant: slug, table_no: String(1 + Math.floor(Math.random() * 20)), server_id: s.id, server_name: s.name, rating,
          comment: Math.random() < 0.35 ? comments[Math.floor(Math.random() * comments.length)] : "",
          suggestion: Math.random() < 0.12 ? suggestions[Math.floor(Math.random() * suggestions.length)] : "" });
      }
      write("reviews", reviews.sort((a, b) => a.created_at.localeCompare(b.created_at)));
      bc && bc.postMessage({ type: "reviews" });
      return true;
    },

    async clearLocal() { if (!live) { write("orders", []); write("reviews", []); bc && bc.postMessage({ type: "orders" }); } },

    async menu() {
      const res = await fetch("/p/data/" + slug + ".json", { cache: "no-store" });
      if (!res.ok) throw new Error("menu");
      return res.json();
    }
  };

  /* ---------- shared helpers ---------- */
  api.peso = (n) => "₱" + Math.round(n).toLocaleString("en-PH");
  api.esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  api.ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h " + (m % 60) + " min ago";
  };
  api.theme = (t) => {
    if (!t) return;
    const r = document.documentElement.style;
    const map = { bg: "--bg", card: "--card", line: "--line", ink: "--ink", ink2: "--ink2", accent: "--accent", onAccent: "--on-accent" };
    for (const k in map) if (t[k]) r.setProperty(map[k], t[k]);
  };

  window.TD = api;
})();
