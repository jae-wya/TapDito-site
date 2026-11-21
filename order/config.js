/* TapDito Order: settings.
   Leave supabaseUrl empty to run in local demo mode (data stays in this browser only).
   Paste the Supabase Project URL and the anon PUBLIC key to go live across phones.
   Never put the service_role key here: this file is public. */
window.TD_CONFIG = {
  supabaseUrl: "https://fhpkvrmcegzbxjwrazyh.supabase.co",
  supabaseKey: "sb_publishable_4gluMTnYG-FrvSvkrof50g_pDJQAMtk",
  // Sample servers for the demo, until the restaurant sends real names.
  demoServers: {
    bonitos: [
      { id: "s1", name: "Ana" },
      { id: "s2", name: "Ben" },
      { id: "s3", name: "Carlo" },
      { id: "s4", name: "Dina" },
      { id: "s5", name: "Eli" }
    ]
  }
};
