(() => {
  const $ = (id) => document.getElementById(id);
  const client = window.supabase?.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY
  );

  let session = null;
  let recorder = null;
  let recordingChunks = [];
  let audioBlob = null;
  let timerInterval = null;
  let seconds = 0;
  let authMode = "signin";
  let lastShareUrl = "";

  const setStatus = (id, message, error = false) => {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error-text", error);
  };

  const formatDate = (value) => new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric"
  }).format(new Date(value));

  const formatTime = (value) => {
    const date = new Date(value);
    return date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  };

  const extensionFor = (file) => {
    const type = file.type || "";
    if (type.includes("mp4") || type.includes("m4a")) return "m4a";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    if (type.includes("wav")) return "wav";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("aac")) return "aac";
    return "webm";
  };

  const photoExtension = (file) => {
    const type = file.type || "";
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    return "jpg";
  };

  function openAuth() {
    $("auth-message").textContent = "";
    $("auth-dialog").showModal();
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signingUp = mode === "signup";
    $("auth-title").textContent = signingUp ? "Let's begin." : "Come on in.";
    $("auth-copy").textContent = signingUp
      ? "Create an account for your own little collection of city sounds."
      : "Sign in to collect the sounds that make a city yours.";
    $("auth-submit").innerHTML = signingUp ? "Create account <span>↗</span>" : "Sign in <span>↗</span>";
    $("auth-switch").textContent = signingUp ? "Already have an account? Sign in" : "New here? Create an account";
    $("auth-password").autocomplete = signingUp ? "new-password" : "current-password";
  }

  function setSession(nextSession) {
    session = nextSession;
    const signedIn = Boolean(session?.user);
    $("user-label").textContent = signedIn ? (session.user.email || "Signed in") : "Not signed in";
    $("auth-open").classList.toggle("hidden", signedIn);
    $("sign-out").classList.toggle("hidden", !signedIn);
    $("studio-locked").classList.toggle("hidden", signedIn);
    $("record-form").classList.toggle("hidden", !signedIn);
    if (signedIn) loadArchive();
    else {
      $("archive-grid").innerHTML = '<div class="empty-archive"><span>♫</span><p>Your collection is waiting for its first sound.</p><small>Every recording becomes a little piece of your city.</small></div>';
      $("archive-count").textContent = "0 RECORDINGS";
    }
  }

  async function loadArchive() {
    if (!session?.user) return;
    const { data, error } = await client.from("recordings")
      .select("*").eq("user_id", session.user.id)
      .order("created_at", {ascending:false});
    if (error) {
      $("archive-grid").innerHTML = '<div class="empty-archive"><p>We could not load your archive.</p><small>Please refresh and try again.</small></div>';
      return;
    }
    $("archive-count").textContent = `${data.length} RECORDING${data.length === 1 ? "" : "S"}`;
    if (!data.length) {
      $("archive-grid").innerHTML = '<div class="empty-archive"><span>♫</span><p>Your collection is waiting for its first sound.</p><small>Every recording becomes a little piece of your city.</small></div>';
      return;
    }
    const cards = await Promise.all(data.map(async (item) => {
      const audio = await signedUrl("sound-audio", item.audio_path);
      const photo = item.photo_path ? await signedUrl("sound-photos", item.photo_path) : null;
      return cardMarkup(item, audio, photo);
    }));
    $("archive-grid").innerHTML = cards.join("");
    $("archive-grid").querySelectorAll("[data-share]").forEach(btn =>
      btn.addEventListener("click", () => showShare(btn.dataset.share)));
    $("archive-grid").querySelectorAll("[data-delete]").forEach(btn =>
      btn.addEventListener("click", () => deleteRecording(btn.dataset.delete)));
  }

  async function signedUrl(bucket, path) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  }

  function cardMarkup(item, audioUrl, photoUrl) {
    const image = photoUrl
      ? `<img src="${photoUrl}" alt="Photo for ${escapeHtml(item.title)}">`
      : "♫";
    return `<article class="sound-card">
      <div class="sound-card-image">${image}</div>
      <div class="sound-card-body">
        <span class="section-index">${escapeHtml(item.location || "CITY SOUND")} · ${formatDate(item.recorded_at)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.feeling || "A moment worth remembering")}</p>
        ${audioUrl ? `<audio controls preload="none" src="${audioUrl}"></audio>` : '<p class="error-text">Audio preview unavailable</p>'}
        <div class="card-actions"><span class="public-badge">${item.is_public ? "● PUBLIC" : "● PRIVATE"}</span><span><button data-share="${item.id}">QR / SHARE</button> <button data-delete="${item.id}">DELETE</button></span></div>
      </div>
    </article>`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[char]);
  }

  async function deleteRecording(id) {
    if (!confirm("Delete this recording and its uploaded files? This cannot be undone.")) return;
    const { data: item, error: readError } = await client.from("recordings")
      .select("audio_path, photo_path").eq("id", id).single();
    if (readError) return alert("Could not find this recording.");
    const paths = [item.audio_path, item.photo_path].filter(Boolean);
    if (paths.length) {
      await Promise.all([
        client.storage.from("sound-audio").remove(paths.filter(p => p.startsWith(session.user.id + "/"))),
        client.storage.from("sound-photos").remove(paths.filter(p => p.startsWith(session.user.id + "/")))
      ]);
    }
    const { error } = await client.from("recordings").delete().eq("id", id);
    if (error) alert(error.message);
    else loadArchive();
  }

  function showShare(id) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("sound", id);
    lastShareUrl = url.toString();
    $("qrcode").innerHTML = "";
    if (window.QRCode) new QRCode($("qrcode"), {text:lastShareUrl,width:176,height:176,colorDark:"#20221e",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
    $("share-url").textContent = lastShareUrl;
    $("share-dialog").showModal();
  }

  async function loadPublicSound(id) {
    if (!client || !id) return;
    const { data: item, error } = await client.from("recordings")
      .select("*").eq("id", id).eq("is_public", true).maybeSingle();
    if (error || !item) {
      $("public-sound-content").innerHTML = '<div class="public-sound"><div class="public-art">♫</div><h2>This sound is private.</h2><p>The owner has not made this recording public, or the link is no longer available.</p></div>';
      $("sound-dialog").showModal();
      return;
    }
    const audioUrl = await signedUrl("sound-audio", item.audio_path);
    const photoUrl = item.photo_path ? await signedUrl("sound-photos", item.photo_path) : null;
    $("public-sound-content").innerHTML = `<div class="public-sound">
      <span class="section-index">A SOUND FROM SOMEONE'S CITY</span>
      <div class="public-art">${photoUrl ? `<img src="${photoUrl}" alt="">` : "♫"}</div>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.location || "Somewhere in the city")} · ${formatDate(item.recorded_at)}</p>
      ${audioUrl ? `<audio controls autoplay src="${audioUrl}"></audio>` : '<p>Audio is temporarily unavailable.</p>'}
      <p>${escapeHtml(item.description || "")}</p>
      <span class="section-index">${escapeHtml(item.feeling || "LISTEN · FEEL · REMEMBER")}</span>
    </div>`;
    $("sound-dialog").showModal();
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!client) return setStatus("auth-message", "Supabase is not configured.", true);
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    $("auth-submit").disabled = true;
    setStatus("auth-message", authMode === "signup" ? "Creating your account…" : "Signing you in…");
    const result = authMode === "signup"
      ? await client.auth.signUp({email, password})
      : await client.auth.signInWithPassword({email, password});
    $("auth-submit").disabled = false;
    if (result.error) return setStatus("auth-message", result.error.message, true);
    if (authMode === "signup" && !result.data.session) {
      setStatus("auth-message", "Account created. Check your email to confirm your address, then sign in.");
      return;
    }
    $("auth-dialog").close();
    setSession(result.data.session);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return setStatus("audio-status", "Microphone recording is not supported in this browser. Please upload an audio file instead.", true);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const preferred = ["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      recorder = preferred ? new MediaRecorder(stream, {mimeType:preferred}) : new MediaRecorder(stream);
      recordingChunks = [];
      recorder.ondataavailable = event => { if (event.data.size) recordingChunks.push(event.data); };
      recorder.onstop = () => {
        audioBlob = new Blob(recordingChunks, {type:recorder.mimeType || "audio/webm"});
        const previewUrl = URL.createObjectURL(audioBlob);
        $("audio-preview").src = previewUrl;
        $("audio-preview").classList.remove("hidden");
        $("audio-file").value = "";
        $("audio-status").textContent = "Recording ready. Listen back before saving.";
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      seconds = 0;
      updateTimer();
      timerInterval = setInterval(() => { seconds++; updateTimer(); }, 1000);
      $("record-start").disabled = true;
      $("record-stop").disabled = false;
      $("record-time").parentElement.classList.add("recording");
      setStatus("audio-status", "Recording… press Stop when you are done.");
    } catch (error) {
      setStatus("audio-status", "Microphone access was not granted. You can upload an audio file instead.", true);
    }
  }

  function updateTimer() {
    $("record-time").textContent = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  }

  function stopRecording() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    clearInterval(timerInterval);
    $("record-start").disabled = false;
    $("record-stop").disabled = true;
    $("record-time").parentElement.classList.remove("recording");
  }

  async function saveRecording(event) {
    event.preventDefault();
    if (!session?.user) return openAuth();
    const chosenFile = $("audio-file").files[0];
    const audioFile = chosenFile || (audioBlob ? new File([audioBlob], `recording.${extensionFor(audioBlob)}`, {type:audioBlob.type}) : null);
    if (!audioFile) return setStatus("save-status", "Please record or upload an audio file first.", true);
    if (audioFile.size > 50 * 1024 * 1024) return setStatus("save-status", "Audio file is larger than 50 MB.", true);
    const photoFile = $("photo-file").files[0];
    if (photoFile && photoFile.size > 10 * 1024 * 1024) return setStatus("save-status", "Photo is larger than 10 MB.", true);
    const title = $("sound-title").value.trim();
    if (!title) return setStatus("save-status", "Please give your sound a title.", true);

    $("save-recording").disabled = true;
    setStatus("save-status", "Uploading your sound…");
    const id = crypto.randomUUID();
    const userFolder = session.user.id;
    const audioPath = `${userFolder}/${id}/audio.${extensionFor(audioFile)}`;
    const {error:audioError} = await client.storage.from("sound-audio").upload(audioPath, audioFile, {contentType:audioFile.type || "audio/webm", upsert:false});
    if (audioError) {
      $("save-recording").disabled = false;
      return setStatus("save-status", audioError.message, true);
    }

    let photoPath = null;
    if (photoFile) {
      photoPath = `${userFolder}/${id}/photo.${photoExtension(photoFile)}`;
      const {error:photoError} = await client.storage.from("sound-photos").upload(photoPath, photoFile, {contentType:photoFile.type,upsert:false});
      if (photoError) {
        await client.storage.from("sound-audio").remove([audioPath]);
        $("save-recording").disabled = false;
        return setStatus("save-status", photoError.message, true);
      }
    }

    const {error:insertError} = await client.from("recordings").insert({
      id, user_id:userFolder, title, location:$("sound-location").value.trim() || null,
      description:$("sound-description").value.trim() || null,
      feeling:$("sound-feeling").value || null,
      audio_path:audioPath, photo_path:photoPath, is_public:$("sound-public").checked
    });
    if (insertError) {
      await client.storage.from("sound-audio").remove([audioPath]);
      if (photoPath) await client.storage.from("sound-photos").remove([photoPath]);
      $("save-recording").disabled = false;
      return setStatus("save-status", insertError.message, true);
    }

    $("record-form").reset();
    audioBlob = null;
    $("audio-preview").removeAttribute("src");
    $("audio-preview").classList.add("hidden");
    $("record-time").textContent = "00:00";
    $("save-recording").disabled = false;
    setStatus("save-status", "Saved. Your sound is now in your archive.");
    await loadArchive();
    if ($("sound-public").checked) showShare(id);
  }

  function bindEvents() {
    $("auth-open").addEventListener("click", openAuth);
    $("studio-auth").addEventListener("click", openAuth);
    $("auth-close").addEventListener("click", () => $("auth-dialog").close());
    $("share-close").addEventListener("click", () => $("share-dialog").close());
    $("sound-close").addEventListener("click", () => $("sound-dialog").close());
    $("auth-switch").addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
    $("auth-form").addEventListener("submit", handleAuth);
    $("record-start").addEventListener("click", startRecording);
    $("record-stop").addEventListener("click", stopRecording);
    $("record-form").addEventListener("submit", saveRecording);
    $("sign-out").addEventListener("click", async () => { await client.auth.signOut(); setSession(null); });
    $("audio-file").addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        event.target.value = "";
        return setStatus("audio-status", "Audio file is larger than 50 MB.", true);
      }
      audioBlob = null;
      $("audio-preview").src = URL.createObjectURL(file);
      $("audio-preview").classList.remove("hidden");
      setStatus("audio-status", `Selected: ${file.name}`);
    });
    $("copy-share").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(lastShareUrl);
        $("copy-share").textContent = "Copied!";
      } catch {
        $("share-url").textContent = lastShareUrl;
      }
    });
  }

  async function init() {
    bindEvents();
    if (!client) {
      $("studio-locked").innerHTML = '<div class="lock-symbol">!</div><h3>Almost ready.</h3><p>Supabase configuration is missing. Please check config.js.</p>';
      return;
    }
    const {data} = await client.auth.getSession();
    setSession(data.session);
    client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    const soundId = new URLSearchParams(window.location.search).get("sound");
    if (soundId) loadPublicSound(soundId);
  }

  document.addEventListener("DOMContentLoaded", init);
})();