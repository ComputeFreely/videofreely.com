(function () {
  "use strict";

  var FFmpegConstructor = null;
  var currentProfile = "mp4";
  var fileUrl = "";
  var downloadUrl = "";
  var commandDirty = false;
  var outputDirty = false;
  var isRunning = false;
  var wasStopped = false;
  var ffmpeg = null;
  var ffmpegRuntimeBlobCache = {};
  var inputName = "input.mp4";
  var progressScale = 1;
  var selectedFile = null;
  var mediaMeta = {
    duration: 0,
    width: 0,
    height: 0,
    isAudio: false
  };
  var logLines = [];
  var ffmpegRuntimeBaseUrls = {
    st: "https://data.videofreely.com/ffmpeg/0.12.10/core/",
    mt: "https://data.videofreely.com/ffmpeg/0.12.10/core-mt/"
  };

  var profiles = {
    mp4: {
      ext: "mp4",
      kind: "video",
      quality: 24,
      width: 1280,
      fps: 30,
      audio: 160
    },
    webm: {
      ext: "webm",
      kind: "video",
      quality: 32,
      width: 1280,
      fps: 30,
      audio: 128
    },
    gif: {
      ext: "gif",
      kind: "gif",
      width: 640,
      fps: 12,
      audio: 0
    },
    mp3: {
      ext: "mp3",
      kind: "audio",
      audio: 192
    },
    m4a: {
      ext: "m4a",
      kind: "audio",
      audio: 160
    },
    wav: {
      ext: "wav",
      kind: "audio",
      audio: 0
    },
    jpg: {
      ext: "jpg",
      kind: "image",
      width: 1280
    }
  };

  var $ = function (selector) {
    return document.querySelector(selector);
  };

  var $$ = function (selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  };

  document.addEventListener("DOMContentLoaded", function () {
    FFmpegConstructor = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
    bindEvents();
    clearDownload();
    setProfile("mp4", true);
    syncRangeLabels();
    syncCommand();
    updateActionState();

    if (!window.WebAssembly) {
      setStatus("This browser does not support WebAssembly.", true);
      $("#engineBadge").textContent = "Unsupported";
    } else if (!FFmpegConstructor) {
      setStatus("FFmpeg failed to load.", true);
      $("#engineBadge").textContent = "Missing";
    }
  });

  function bindEvents() {
    $$(".profile-card").forEach(function (button) {
      button.addEventListener("click", function () {
        setProfile(button.dataset.profile, true);
      });
    });

    $("#fileInput").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) {
        setFile(file);
      }
    });

    bindDropZone();

    $("#convertForm").addEventListener("input", function (event) {
      if (event.target.id === "outputName") {
        outputDirty = true;
      }
      if (event.target.id === "advancedCommand") {
        commandDirty = true;
      }
      syncRangeLabels();
      if (event.target.id !== "advancedCommand") {
        syncCommand();
      }
    });

    $("#convertForm").addEventListener("change", function (event) {
      if (event.target.id === "advancedMode") {
        commandDirty = false;
        $("#advancedBlock").hidden = !event.target.checked;
      }
      if (event.target.id === "outputName" && !$("#advancedMode").checked) {
        var cleanedName = sanitizeFilename(event.target.value);
        if (cleanedName) {
          event.target.value = replaceExtension(cleanedName, profiles[currentProfile].ext);
        }
      }
      syncRangeLabels();
      syncCommand();
      updateControlVisibility();
    });

    $("#convertButton").addEventListener("click", runConversion);
    $("#stopButton").addEventListener("click", stopConversion);
    $("#resetButton").addEventListener("click", resetAll);
    $("#resetCommandButton").addEventListener("click", function () {
      commandDirty = false;
      syncCommand();
    });
  }

  function bindDropZone() {
    var dropZone = $("#dropZone");

    ["dragenter", "dragover"].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropZone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropZone.classList.remove("dragging");
      });
    });

    dropZone.addEventListener("drop", function (event) {
      if (isRunning) {
        setStatus("Conversion in progress. Stop it before choosing a new file.");
        return;
      }
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        $("#fileInput").files = event.dataTransfer.files;
        setFile(file);
      }
    });
  }

  function setProfile(profileName, applyDefaults) {
    var profile = profiles[profileName];
    if (!profile) {
      return;
    }

    currentProfile = profileName;

    $$(".profile-card").forEach(function (button) {
      var isActive = button.dataset.profile === profileName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (applyDefaults) {
      if (profile.quality) {
        $("#qualityRange").value = profile.quality;
      }
      if (profile.width) {
        $("#maxWidthRange").value = profile.width;
      }
      if (profile.fps) {
        $("#fpsRange").value = profile.fps;
      }
      if (profile.audio) {
        $("#audioBitrateRange").value = profile.audio;
      }
      $("#keepOriginalSize").checked = false;
      $("#keepOriginalFps").checked = false;
      $("#muteAudio").checked = false;
      $("#encoderSpeed").value = "veryfast";
      commandDirty = false;
    }

    normalizeOutputName();
    updateControlVisibility();
    syncRangeLabels();
    syncCommand();
  }

  function updateControlVisibility() {
    var profile = profiles[currentProfile];
    var isVideo = profile.kind === "video";
    var isGif = profile.kind === "gif";
    var isImage = profile.kind === "image";
    var isAudio = profile.kind === "audio";
    var hasVideoControls = isVideo || isGif || isImage;

    $("#videoPanel").hidden = !hasVideoControls;
    $("#qualityField").hidden = !isVideo;
    $("#widthField").hidden = isAudio;
    $("#originalSizeField").hidden = isAudio;
    $("#fpsField").hidden = isAudio || isImage;
    $("#originalFpsField").hidden = isAudio || isGif || isImage;
    $("#speedField").hidden = currentProfile !== "mp4";
    $("#audioBitrateField").hidden = isGif || isImage || currentProfile === "wav";
    $("#muteField").hidden = !isVideo;

    var advanced = $("#advancedMode").checked;
    $("#advancedBlock").hidden = !advanced;
    $("#outputName").disabled = isRunning || advanced;
    $("#outputNameNote").hidden = !advanced;
  }

  function setFile(file) {
    selectedFile = file;
    inputName = makeInputName(file);
    mediaMeta = {
      duration: 0,
      width: 0,
      height: 0,
      isAudio: /^audio\//.test(file.type)
    };

    clearDownload();
    clearLog();
    revokeFileUrl();

    fileUrl = URL.createObjectURL(file);
    $("#fileName").textContent = file.name || inputName;
    $("#fileSize").textContent = formatBytes(file.size);
    $("#fileDuration").textContent = "-";
    $("#fileVideo").textContent = mediaMeta.isAudio ? "Audio" : "-";
    $("#previewStage").hidden = false;
    $("#previewFallback").hidden = true;

    if (mediaMeta.isAudio) {
      showAudioPreview(fileUrl);
    } else {
      showVideoPreview(fileUrl);
    }

    outputDirty = false;
    commandDirty = false;
    normalizeOutputName();
    syncCommand();
    updateActionState();

    if (file.size > 700 * 1024 * 1024) {
      setStatus("Large file selected. Browser memory may limit conversion.", false);
    } else {
      setStatus("Ready to convert.");
    }
  }

  function showVideoPreview(url) {
    var video = $("#videoPreview");
    var audio = $("#audioPreview");
    audio.hidden = true;
    audio.removeAttribute("src");
    video.hidden = false;
    video.src = url;
    video.load();

    video.onloadedmetadata = function () {
      mediaMeta.duration = Number.isFinite(video.duration) ? video.duration : 0;
      mediaMeta.width = video.videoWidth || 0;
      mediaMeta.height = video.videoHeight || 0;
      $("#fileDuration").textContent = formatDuration(mediaMeta.duration);
      $("#fileVideo").textContent = mediaMeta.width && mediaMeta.height ? mediaMeta.width + " x " + mediaMeta.height : "Video";
    };

    video.onerror = function () {
      video.hidden = true;
      $("#previewFallback").hidden = false;
      $("#fileVideo").textContent = "No preview";
    };
  }

  function showAudioPreview(url) {
    var video = $("#videoPreview");
    var audio = $("#audioPreview");
    video.hidden = true;
    video.removeAttribute("src");
    audio.hidden = false;
    audio.src = url;
    audio.load();

    audio.onloadedmetadata = function () {
      mediaMeta.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      $("#fileDuration").textContent = formatDuration(mediaMeta.duration);
      $("#fileVideo").textContent = "Audio";
    };

    audio.onerror = function () {
      audio.hidden = true;
      $("#previewFallback").hidden = false;
      $("#fileVideo").textContent = "No preview";
    };
  }

  function syncRangeLabels() {
    var quality = clampNumber($("#qualityRange").value, 18, 36, profiles[currentProfile].quality || 24);
    var width = clampNumber($("#maxWidthRange").value, 320, 3840, profiles[currentProfile].width || 1280);
    var fps = clampNumber($("#fpsRange").value, 6, 60, profiles[currentProfile].fps || 30);
    var audio = clampNumber($("#audioBitrateRange").value, 64, 320, profiles[currentProfile].audio || 160);

    $("#qualityRange").value = quality;
    $("#maxWidthRange").value = width;
    $("#fpsRange").value = fps;
    $("#audioBitrateRange").value = audio;
    $("#qualityValue").textContent = "CRF " + quality;
    $("#maxWidthValue").textContent = $("#keepOriginalSize").checked ? "Original" : width + " px";
    $("#fpsValue").textContent = $("#keepOriginalFps").checked ? "Original" : fps + " fps max";
    $("#audioBitrateValue").textContent = audio + " kbps";
  }

  function syncCommand() {
    if ($("#advancedMode").checked && commandDirty) {
      return;
    }

    try {
      $("#advancedCommand").value = commandToText(buildPresetArgs().args);
    } catch (error) {
      $("#advancedCommand").value = "";
    }
  }

  function buildPresetArgs() {
    var profile = profiles[currentProfile];
    var outputPath = getOutputPath();
    var args = [];
    var start = parseTimecode($("#trimStart").value);
    var end = parseTimecode($("#trimEnd").value);

    if (start !== null && start > 0) {
      args.push("-ss", formatTimeArg(start));
    }

    args.push("-i", inputName);

    if (end !== null) {
      var startValue = start || 0;
      if (end <= startValue) {
        throw new Error("End time must be after the start time.");
      }
      args.push("-t", formatTimeArg(end - startValue));
    }

    if (profile.kind === "video") {
      if (currentProfile === "mp4") {
        // x264 can deadlock under the pthread-backed wasm core when it auto-selects multiple encoder threads.
        args.push("-c:v", "libx264", "-threads", "1", "-preset", $("#encoderSpeed").value, "-crf", $("#qualityRange").value, "-pix_fmt", "yuv420p");
        addVideoFilters(args, true);
        if ($("#muteAudio").checked) {
          args.push("-an");
        } else {
          args.push("-c:a", "aac", "-b:a", $("#audioBitrateRange").value + "k");
        }
        args.push("-movflags", "+faststart", outputPath);
      } else {
        args.push("-c:v", "libvpx-vp9", "-crf", $("#qualityRange").value, "-b:v", "0", "-row-mt", "1", "-cpu-used", "5");
        addVideoFilters(args, false);
        if ($("#muteAudio").checked) {
          args.push("-an");
        } else {
          args.push("-c:a", "libopus", "-b:a", $("#audioBitrateRange").value + "k");
        }
        args.push(outputPath);
      }
    } else if (profile.kind === "gif") {
      args.push("-filter_complex", buildGifFilter(), "-loop", "0", outputPath);
    } else if (profile.kind === "audio") {
      args.push("-vn");
      if (currentProfile === "mp3") {
        args.push("-c:a", "libmp3lame", "-b:a", $("#audioBitrateRange").value + "k");
      } else if (currentProfile === "m4a") {
        args.push("-c:a", "aac", "-b:a", $("#audioBitrateRange").value + "k");
      } else {
        args.push("-c:a", "pcm_s16le");
      }
      args.push(outputPath);
    } else if (profile.kind === "image") {
      addStillFrameFilters(args);
      args.push("-frames:v", "1", "-q:v", "2", outputPath);
    }

    return {
      args: args,
      outputPath: outputPath,
      requiresAudio: profile.kind === "audio"
    };
  }

  function addVideoFilters(args, requireEvenSize) {
    var filters = [];
    if (!$("#keepOriginalFps").checked) {
      filters.push("fps=" + $("#fpsRange").value);
    }
    if (!$("#keepOriginalSize").checked) {
      filters.push(buildScaleFilter($("#maxWidthRange").value));
    } else if (requireEvenSize) {
      // libx264 with yuv420p rejects odd dimensions, so round original sizes down to even.
      filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    }
    if (filters.length) {
      args.push("-vf", filters.join(","));
    }
  }

  function addStillFrameFilters(args) {
    if (!$("#keepOriginalSize").checked) {
      args.push("-vf", buildScaleFilter($("#maxWidthRange").value));
    }
  }

  function buildGifFilter() {
    var filters = ["fps=" + $("#fpsRange").value];
    if (!$("#keepOriginalSize").checked) {
      filters.push(buildScaleFilter($("#maxWidthRange").value));
    }
    return filters.join(",") + ",split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3";
  }

  function buildScaleFilter(width) {
    var safeWidth = clampNumber(width, 320, 3840, 1280);
    return "scale=w=min(" + safeWidth + "\\,iw):h=-2:force_divisible_by=2:flags=lanczos";
  }

  async function runConversion() {
    if (isRunning || !selectedFile) {
      return;
    }

    if (!window.WebAssembly || !FFmpegConstructor) {
      setStatus("This browser cannot run ffmpeg.wasm.", true);
      return;
    }

    var commandInfo;
    try {
      commandInfo = getCommandForRun();
    } catch (error) {
      setStatus(error.message || "Invalid command.", true);
      return;
    }

    clearDownload();
    clearLog();
    setRunning(true);
    setProgress(0);
    wasStopped = false;
    progressScale = $("#advancedMode").checked ? 1 : computeProgressScale();

    try {
      await ensureFFmpeg();
      setStatus("Preparing input...");
      appendLog("$ " + commandToText(commandInfo.args));
      await deleteVirtualFile(inputName);
      await deleteVirtualFile(commandInfo.outputPath);
      await ffmpeg.writeFile(inputName, new Uint8Array(await selectedFile.arrayBuffer()));

      if (commandInfo.requiresAudio) {
        setStatus("Checking audio stream...");
        var hasAudio = await inputHasAudioStream(inputName);
        if (hasAudio === false) {
          throw new Error("This file does not contain an audio stream to extract.");
        }
      }

      setStatus("Converting...");
      var exitCode = await ffmpeg.exec(commandInfo.args);
      if (exitCode !== 0) {
        throw new Error("FFmpeg exited with code " + exitCode + ".");
      }

      setStatus("Reading output...");
      var data = await ffmpeg.readFile(commandInfo.outputPath);
      if (!data || !data.byteLength) {
        throw new Error("No output file was produced.");
      }

      setDownload(data, commandInfo.outputPath);
      setProgress(100);
      setStatus("Done: " + formatBytes(data.byteLength) + " output.");
    } catch (error) {
      var message = error && error.message ? error.message : String(error);
      if (wasStopped || /terminate/i.test(message)) {
        // Stop and Reset already set their own status; don't report a fake error.
        if (!wasStopped) {
          setStatus("Stopped.");
          $("#engineBadge").textContent = "Stopped";
        }
        return;
      }
      message = friendlyErrorMessage(message, commandInfo);
      setStatus(message.replace(/^Error:\s*/, ""), true);
      appendLog("Error: " + message);
    } finally {
      await deleteVirtualFile(inputName);
      await deleteVirtualFile(commandInfo.outputPath);
      setRunning(false);
    }
  }

  function computeProgressScale() {
    var duration = mediaMeta.duration;
    var start = 0;
    var end = null;

    if (!duration) {
      return 1;
    }

    try {
      start = parseTimecode($("#trimStart").value) || 0;
      end = parseTimecode($("#trimEnd").value);
    } catch (error) {
      return 1;
    }

    var span = (end !== null ? Math.min(end, duration) : duration) - start;
    if (!(span > 0) || span >= duration) {
      return 1;
    }
    return duration / span;
  }

  function getCommandForRun() {
    if ($("#advancedMode").checked) {
      var args = parseCommand($("#advancedCommand").value);
      if (args[0] === "ffmpeg") {
        args.shift();
      }
      if (!args.length) {
        throw new Error("Enter an FFmpeg command.");
      }
      return {
        args: args,
        outputPath: findOutputPath(args),
        requiresAudio: commandNeedsAudio(args)
      };
    }
    return buildPresetArgs();
  }

  async function inputHasAudioStream(path) {
    var output = [];
    var savedLogLines = logLines.slice();
    var savedLogOutput = $("#logOutput").textContent;
    var probeLogger = function (event) {
      if (event && event.message) {
        output.push(event.message);
      }
    };

    if (!ffmpeg || !ffmpeg.loaded || typeof ffmpeg.ffprobe !== "function") {
      return null;
    }

    ffmpeg.on("log", probeLogger);

    try {
      var exitCode = await ffmpeg.ffprobe([
        "-hide_banner",
        path
      ]);

      if (exitCode !== 0) {
        return null;
      }

      if (!output.length) {
        return null;
      }

      return /Stream #\d+:\d+.*Audio:/i.test(output.join("\n"));
    } catch (error) {
      return null;
    } finally {
      ffmpeg.off("log", probeLogger);
      logLines = savedLogLines;
      $("#logOutput").textContent = savedLogOutput;
    }
  }

  function commandNeedsAudio(args) {
    var outputPath = findOutputPath(args);
    return isAudioOutputPath(outputPath) || args.indexOf("-vn") !== -1;
  }

  function isAudioOutputPath(path) {
    return /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(String(path || ""));
  }

  function friendlyErrorMessage(message, commandInfo) {
    var text = String(message || "");
    var context = text + "\n" + logLines.join("\n");
    if (commandInfo && commandInfo.requiresAudio && /does not contain any stream|matches no streams|audio stream/i.test(context)) {
      return "This file does not contain an audio stream to extract.";
    }
    return text;
  }

  async function ensureFFmpeg() {
    if (ffmpeg && ffmpeg.loaded) {
      return;
    }

    if (canUseMultithread()) {
      try {
        await loadFFmpegCore("mt");
        return;
      } catch (error) {
        appendLog("Multi-thread core failed to load; falling back to single-thread core.");
        appendLog(String(error && error.message ? error.message : error));
        if (ffmpeg) {
          ffmpeg.terminate();
          ffmpeg = null;
        }
      }
    }

    await loadFFmpegCore("st");
  }

  async function loadFFmpegCore(engine) {
    var isMultithread = engine === "mt";
    var baseUrl = ffmpegRuntimeBaseUrls[engine];

    setStatus(isMultithread ? "Loading FFmpeg multi-thread core..." : "Loading FFmpeg...");
    $("#engineBadge").textContent = "Loading";
    ffmpeg = new FFmpegConstructor();
    ffmpeg.on("log", function (event) {
      if (event && event.message) {
        appendLog(event.message);
      }
    });
    ffmpeg.on("progress", function (event) {
      if (!event) {
        return;
      }
      if (Number.isFinite(event.progress) && event.progress > 0) {
        setProgress(Math.max(1, Math.min(99, event.progress * 100 * progressScale)));
      }
    });

    var loadOptions = {
      coreURL: await loadRuntimeBlobUrl(baseUrl + "ffmpeg-core.js", "text/javascript"),
      wasmURL: await loadRuntimeBlobUrl(baseUrl + "ffmpeg-core.wasm", "application/wasm")
    };

    if (isMultithread) {
      loadOptions.workerURL = await loadRuntimeBlobUrl(baseUrl + "ffmpeg-core.worker.js", "text/javascript");
    }

    await ffmpeg.load(loadOptions);
    setProgress(0);
    $("#engineBadge").textContent = "Ready";
  }

  async function loadRuntimeBlobUrl(url, mimeType) {
    var cacheKey = mimeType + " " + url;

    if (ffmpegRuntimeBlobCache[cacheKey]) {
      return ffmpegRuntimeBlobCache[cacheKey];
    }

    var response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error("Unable to load FFmpeg runtime asset: " + response.status + " " + url);
    }

    var bytes = await readBodyWithProgress(response);
    var blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    ffmpegRuntimeBlobCache[cacheKey] = blobUrl;
    return blobUrl;
  }

  async function readBodyWithProgress(response) {
    var total = Number(response.headers.get("Content-Length")) || 0;

    if (!response.body || typeof response.body.getReader !== "function") {
      return new Uint8Array(await response.arrayBuffer());
    }

    var reader = response.body.getReader();
    var chunks = [];
    var received = 0;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      chunks.push(chunk.value);
      received += chunk.value.byteLength;
      reportEngineDownload(received, total);
    }

    var bytes = new Uint8Array(received);
    var offset = 0;
    chunks.forEach(function (part) {
      bytes.set(part, offset);
      offset += part.byteLength;
    });
    return bytes;
  }

  function reportEngineDownload(received, total) {
    var receivedMb = (received / (1024 * 1024)).toFixed(1);
    if (total > 0) {
      var totalMb = (total / (1024 * 1024)).toFixed(1);
      setStatus("Loading FFmpeg engine... " + receivedMb + " of " + totalMb + " MB");
      setProgress(Math.min(99, (received / total) * 100));
    } else {
      setStatus("Loading FFmpeg engine... " + receivedMb + " MB");
    }
  }

  function canUseMultithread() {
    return Boolean(window.crossOriginIsolated && window.SharedArrayBuffer);
  }

  function stopConversion() {
    if (!ffmpeg) {
      return;
    }
    wasStopped = true;
    ffmpeg.terminate();
    ffmpeg = null;
    setRunning(false);
    setProgress(0);
    setStatus("Stopped.");
    $("#engineBadge").textContent = "Stopped";
  }

  function resetAll() {
    if (isRunning) {
      stopConversion();
    }
    selectedFile = null;
    inputName = "input.mp4";
    mediaMeta = {
      duration: 0,
      width: 0,
      height: 0,
      isAudio: false
    };
    revokeFileUrl();
    clearDownload();
    clearLog();
    $("#fileInput").value = "";
    $("#videoPreview").removeAttribute("src");
    $("#audioPreview").removeAttribute("src");
    $("#previewStage").hidden = true;
    $("#previewFallback").hidden = true;
    $("#fileName").textContent = "None selected";
    $("#fileSize").textContent = "-";
    $("#fileDuration").textContent = "-";
    $("#fileVideo").textContent = "-";
    $("#trimStart").value = "";
    $("#trimEnd").value = "";
    outputDirty = false;
    commandDirty = false;
    setProfile("mp4", true);
    setStatus("Select a file to begin.");
    setProgress(0);
    updateActionState();
  }

  function setRunning(running) {
    isRunning = running;
    $("#convertButton").disabled = running || !selectedFile;
    $("#stopButton").disabled = !running;
    $("#fileInput").disabled = running;
    $$("#convertForm input, #convertForm select, #convertForm textarea, #convertForm button").forEach(function (element) {
      if (element.id === "outputName") {
        element.disabled = running || $("#advancedMode").checked;
      } else if (element.id !== "resetCommandButton") {
        element.disabled = running;
      }
    });
    $$(".profile-card").forEach(function (button) {
      button.disabled = running;
    });
  }

  function updateActionState() {
    $("#convertButton").disabled = isRunning || !selectedFile;
    $("#stopButton").disabled = !isRunning;
  }

  function setDownload(data, outputPath) {
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    var blob = new Blob([bytes], { type: mimeForOutput(outputPath) });
    var downloadButton = $("#downloadButton");
    downloadUrl = URL.createObjectURL(blob);
    downloadButton.href = downloadUrl;
    downloadButton.download = basename(outputPath);
    downloadButton.classList.remove("disabled");
    downloadButton.setAttribute("aria-disabled", "false");
  }

  function clearDownload() {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = "";
    }
    var downloadButton = $("#downloadButton");
    downloadButton.removeAttribute("href");
    downloadButton.download = "";
    downloadButton.classList.add("disabled");
    downloadButton.setAttribute("aria-disabled", "true");
  }

  function revokeFileUrl() {
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
      fileUrl = "";
    }
  }

  function setStatus(message, isError) {
    $("#statusText").textContent = message;
    if (isError) {
      $("#engineBadge").textContent = "Needs attention";
    } else if (!isRunning) {
      $("#engineBadge").textContent = "Ready";
    }
  }

  function setProgress(value) {
    var percent = Math.max(0, Math.min(100, Math.round(value)));
    $("#progressFill").style.width = percent + "%";
    $("#progressValue").textContent = percent + "%";
    $("#progressTrack").setAttribute("aria-valuenow", String(percent));
  }

  function appendLog(message) {
    logLines.push(String(message));
    if (logLines.length > 140) {
      logLines = logLines.slice(logLines.length - 140);
    }
    $("#logOutput").textContent = logLines.join("\n");
  }

  function clearLog() {
    logLines = [];
    $("#logOutput").textContent = "";
  }

  async function deleteVirtualFile(path) {
    if (!ffmpeg || !ffmpeg.loaded || !path) {
      return;
    }
    try {
      await ffmpeg.deleteFile(path);
    } catch (error) {
      // Missing files are expected between runs.
    }
  }

  function normalizeOutputName() {
    var profile = profiles[currentProfile];
    var outputInput = $("#outputName");
    var current = sanitizeFilename(outputInput.value);

    if (!outputDirty) {
      outputInput.value = buildDefaultOutputName(profile.ext);
      return;
    }

    if (!current) {
      outputInput.value = buildDefaultOutputName(profile.ext);
      outputDirty = false;
      return;
    }

    outputInput.value = replaceExtension(current, profile.ext);
  }

  function getOutputPath() {
    var profile = profiles[currentProfile];
    var name = sanitizeFilename($("#outputName").value);
    if (!name) {
      name = buildDefaultOutputName(profile.ext);
    }
    // The preset picks the muxer, so the extension must always match it.
    return replaceExtension(name, profile.ext);
  }

  function buildDefaultOutputName(ext) {
    var sourceBase = selectedFile ? basenameWithoutExtension(selectedFile.name) : "";
    var suffix = currentProfile === "jpg" ? "-frame" : currentProfile === "gif" ? "-clip" : currentProfile === "mp3" || currentProfile === "m4a" || currentProfile === "wav" ? "-audio" : "-converted";
    if (!sourceBase) {
      return "converted." + ext;
    }
    return sanitizeFilename(sourceBase + suffix + "." + ext);
  }

  function makeInputName(file) {
    var ext = extensionOf(file.name) || extensionFromType(file.type) || "media";
    return "input." + sanitizeExtension(ext);
  }

  function extensionOf(name) {
    var match = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    return match ? match[1] : "";
  }

  function extensionFromType(type) {
    var map = {
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
      "audio/flac": "flac"
    };
    return map[type] || "";
  }

  function mimeForOutput(path) {
    var map = {
      aac: "audio/aac",
      avi: "video/x-msvideo",
      flac: "audio/flac",
      gif: "image/gif",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      m4a: "audio/mp4",
      m4v: "video/mp4",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      oga: "audio/ogg",
      ogg: "audio/ogg",
      opus: "audio/ogg",
      png: "image/png",
      wav: "audio/wav",
      webm: "video/webm",
      webp: "image/webp"
    };
    return map[extensionOf(path)] || "application/octet-stream";
  }

  function replaceExtension(name, ext) {
    var clean = sanitizeFilename(name);
    if (extensionOf(clean)) {
      return clean.replace(/\.[^.]+$/, "." + ext);
    }
    return clean + "." + ext;
  }

  function sanitizeFilename(name) {
    var clean = String(name || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
    return clean.slice(0, 120);
  }

  function sanitizeExtension(ext) {
    return String(ext || "media").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "media";
  }

  function basename(path) {
    return String(path || "").split(/[\\/]/).pop() || "output";
  }

  function basenameWithoutExtension(path) {
    return basename(path).replace(/\.[^.]+$/, "") || "converted";
  }

  function commandToText(args) {
    return ["ffmpeg"].concat(args).map(shellQuote).join(" ");
  }

  function shellQuote(value) {
    var text = String(value);
    if (!text) {
      return "''";
    }
    if (/^[A-Za-z0-9_./:=+,-]+$/.test(text)) {
      return text;
    }
    return "'" + text.replace(/'/g, "'\\''") + "'";
  }

  function parseCommand(command) {
    var tokens = [];
    var token = "";
    var quote = "";
    var escaping = false;
    var input = String(command || "").trim();

    for (var index = 0; index < input.length; index += 1) {
      var char = input[index];

      if (escaping) {
        token += char;
        escaping = false;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = "";
        } else if (quote === '"') {
          if (char === "\\") {
            escaping = true;
          } else {
            token += char;
          }
        } else {
          token += char;
        }
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (token) {
          tokens.push(token);
          token = "";
        }
        continue;
      }

      token += char;
    }

    if (escaping) {
      token += "\\";
    }
    if (quote) {
      throw new Error("The advanced command has an unclosed quote.");
    }
    if (token) {
      tokens.push(token);
    }
    return tokens;
  }

  function findOutputPath(args) {
    var outputPath = args[args.length - 1];
    if (!outputPath || outputPath[0] === "-") {
      throw new Error("The command must end with an output file path.");
    }
    return outputPath;
  }

  function parseTimecode(value) {
    var text = String(value || "").trim();
    var total = 0;
    var parts;

    if (!text) {
      return null;
    }

    if (/^\d+(?:\.\d+)?$/.test(text)) {
      return Number(text);
    }

    parts = text.split(":");
    if (parts.length < 2 || parts.length > 3) {
      throw new Error("Use seconds, mm:ss, or hh:mm:ss for trim times.");
    }

    parts.forEach(function (part) {
      if (!/^\d+(?:\.\d+)?$/.test(part)) {
        throw new Error("Use seconds, mm:ss, or hh:mm:ss for trim times.");
      }
    });

    if (parts.length === 2) {
      total = Number(parts[0]) * 60 + Number(parts[1]);
    } else {
      total = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    }

    return total;
  }

  function formatTimeArg(seconds) {
    return Number(seconds).toFixed(3).replace(/\.?0+$/, "");
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Number(seconds) || 0);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = Math.floor(total % 60);
    if (!total) {
      return "-";
    }
    if (hours) {
      return hours + ":" + pad2(minutes) + ":" + pad2(secs);
    }
    return minutes + ":" + pad2(secs);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    var units = ["B", "KB", "MB", "GB"];
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return (unit === 0 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2)) + " " + units[unit];
  }

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      number = fallback;
    }
    return Math.max(min, Math.min(max, Math.round(number)));
  }
})();
