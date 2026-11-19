/* LUKORY static demo. No API calls or external runtime dependencies. */
(() => {
  "use strict";
  const D = window.LUKORY_DATA;
  if (!D) return;
  const STORAGE_KEY = "lukory.demo.v1";
  const LEGACY_STORAGE_KEY = "pinta.demo.v1";
  const MAX_POSTS = 48;
  const MAX_COMMENTS = 100;
  const VOTE_LABELS = ["다정해요", "신비로워요", "자유로워요", "단단해요"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const escapeHTML = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const clean = (value, max) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const safeTime = (value) =>
    Number.isFinite(value) && value >= 0 && value <= Date.now() + 60000
      ? value
      : Date.now();
  const uid = (prefix) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const icons = {
    heart:
      '<svg class="icon heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    comment:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
    close:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };
  let storageAvailable = true;
  const blankState = () => ({
    version: 1,
    posts: [],
    comments: {},
    likes: {},
    votes: {},
    nickname: "",
  });

  // Stored data is untrusted. Validate its shape and bound its size before rendering.
  function readState() {
    const result = blankState();
    try {
      // Preserve existing demo posts and reactions when the same site is rebranded.
      const raw =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return result;
      const stored = JSON.parse(raw);
      if (!stored || stored.version !== 1) return result;
      const usedIds = new Set(D.faces.map((face) => face.id));
      if (Array.isArray(stored.posts)) {
        stored.posts.slice(0, MAX_POSTS).forEach((post) => {
          if (
            !post ||
            typeof post.id !== "string" ||
            !/^local-[a-z0-9-]{1,90}$/.test(post.id) ||
            usedIds.has(post.id) ||
            !Number.isInteger(post.portrait) ||
            post.portrait < 0 ||
            post.portrait > 5 ||
            !D.moods.some((m) => m.id === post.mood)
          )
            return;
          const title = clean(post.title, 48),
            author = clean(post.author, 16);
          if (!title || !author) return;
          usedIds.add(post.id);
          const mood = D.moods.find((m) => m.id === post.mood);
          result.posts.push({
            id: post.id,
            number: "YOU",
            portrait: post.portrait,
            mood: post.mood,
            title,
            author,
            quote: "“이 얼굴의 이야기를 들려주세요.”",
            tags: [...mood.tags],
            likes: 0,
            votes: [0, 0, 0, 0],
            comments: [],
            answers: Array.isArray(post.answers)
              ? post.answers.slice(0, 5).map((x) => clean(x, 40))
              : [],
            prompt:
              "다섯 가지 답으로 만나본 새로운 얼굴이에요. 어떤 첫인상이 떠오르나요?",
            createdAt: safeTime(post.createdAt),
            local: true,
          });
        });
      }
      usedIds.forEach((id) => {
        if (
          stored.likes &&
          Object.hasOwn(stored.likes, id) &&
          stored.likes[id] === true
        )
          result.likes[id] = true;
        if (
          stored.votes &&
          Object.hasOwn(stored.votes, id) &&
          Number.isInteger(stored.votes[id]) &&
          stored.votes[id] >= 0 &&
          stored.votes[id] < 4
        )
          result.votes[id] = stored.votes[id];
        if (
          stored.comments &&
          Object.hasOwn(stored.comments, id) &&
          Array.isArray(stored.comments[id])
        ) {
          const commentIds = new Set();
          result.comments[id] = stored.comments[id]
            .slice(0, MAX_COMMENTS)
            .flatMap((c) => {
              if (
                !c ||
                typeof c.id !== "string" ||
                !/^comment-[a-z0-9-]{1,90}$/.test(c.id) ||
                commentIds.has(c.id)
              )
                return [];
              const text = clean(c.text, 300),
                author = clean(c.author, 16);
              if (!text || !author) return [];
              commentIds.add(c.id);
              return [
                {
                  id: c.id,
                  author,
                  text,
                  local: true,
                  createdAt: safeTime(c.createdAt),
                },
              ];
            });
        }
      });
      result.nickname = clean(stored.nickname, 16);
    } catch (error) {
      if (error && error.name !== "SyntaxError") storageAvailable = false;
    }
    return result;
  }
  const state = readState();
  let filter = "all";
  let sort = "popular";
  let activeFaceId = null;
  let studio = null;
  let generationTimer = null;
  let toastTimer = null;
  const modalTriggers = new WeakMap();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      return false;
    }
  }
  function toast(message) {
    const el = $("#toast");
    clearTimeout(toastTimer);
    el.textContent = message;
    el.hidden = false;
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 4200);
  }
  const allFaces = () => [...state.posts, ...D.faces];
  const getFace = (id) => allFaces().find((face) => face.id === id);
  const localComments = (id) => state.comments[id] || [];
  const commentsFor = (face) => [
    ...(face.comments || []),
    ...localComments(face.id),
  ];
  const likeCount = (face) => face.likes + (state.likes[face.id] ? 1 : 0);
  const voteCount = (face, i) =>
    face.votes[i] + (state.votes[face.id] === i ? 1 : 0);
  const pad = (n) => String(n).padStart(2, "0");
  function timeLabel(time) {
    const seconds = Math.max(0, (Date.now() - time) / 1000);
    if (seconds < 60) return "방금";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    return `${Math.floor(seconds / 86400)}일 전`;
  }
  function openModal(dialog) {
    if (dialog.open) return;
    const trigger = document.activeElement;
    $$("dialog[open]").forEach((other) => other.close());
    modalTriggers.set(dialog, trigger);
    dialog.showModal();
  }
  function closeModal(dialog) {
    if (dialog?.open) dialog.close();
  }
  $$("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closeModal(dialog);
    });
    dialog.addEventListener("close", () => {
      if (dialog.id === "studio-dialog") {
        clearTimeout(generationTimer);
        generationTimer = null;
      }
      const trigger = modalTriggers.get(dialog);
      if (!document.querySelector("dialog[open]")) {
        const replacement =
          dialog.id === "face-dialog" && activeFaceId
            ? document.querySelector(
                `[data-face-card="${activeFaceId}"] .portrait-button`,
              )
            : null;
        const target = trigger?.isConnected
          ? trigger
          : replacement ||
            document.querySelector('.header-right [data-action="create"]');
        target?.focus({ preventScroll: true });
      }
    });
  });
  const closeButton =
    '<button type="button" class="close-button" data-action="close" aria-label="닫기">' +
    icons.close +
    "</button>";
  const studioHeader = `<div class="modal-header"><div class="modal-brand"><span class="modal-wordmark">lukory<span class="orange">.</span></span><span class="modal-brand-caption">FACE STUDIO</span></div>${closeButton}</div>`;
  function portraitHTML(index, label, className = "") {
    return `<div class="portrait portrait-${index} ${className}" role="img" aria-label="${escapeHTML(label)}"></div>`;
  }
  function cardHTML(face) {
    const liked = !!state.likes[face.id];
    return `<article class="face-card" data-face-card="${face.id}">
      <button type="button" class="portrait-button" data-action="open-face" data-id="${face.id}" aria-label="${escapeHTML(face.title)} — 얼굴과 댓글 보기">
        ${portraitHTML(face.portrait, `AI가 만든 가상 인물 ${face.number}`)}
        <span class="card-topline"><span class="face-number">FACE NO. ${escapeHTML(face.number)}</span>${face.local ? '<span class="card-badge new">MY FACE</span>' : face.id === "face-001" ? '<span class="card-badge">MOST LOVED</span>' : face.id === "face-004" ? '<span class="card-badge new">FRESH FACE</span>' : ""}</span>
        <span class="card-bottomline"><span class="card-quote">${escapeHTML(face.quote)}</span><span class="card-open" aria-hidden="true">${icons.plus}</span></span>
      </button>
      <div class="card-copy"><div class="card-title-row"><button type="button" class="face-title-button" data-action="open-face" data-id="${face.id}">${escapeHTML(face.title)}</button>${face.local ? '<span class="local-label">이 기기</span>' : ""}</div>
      <p class="card-author">by ${escapeHTML(face.author)} · ${face.local ? "방금 만든 데모 얼굴" : "가상의 크리에이터"}</p>
      <div class="card-bottom"><div class="tag-pair">${face.tags.map((tag) => `<span class="face-tag">${escapeHTML(tag)}</span>`).join("")}</div><div class="card-actions"><button type="button" class="icon-action ${liked ? "liked" : ""}" data-action="like" data-id="${face.id}" data-like-id="${face.id}" aria-label="${escapeHTML(face.title)} 좋아요" aria-pressed="${liked}">${icons.heart}<span data-like-count>${likeCount(face)}</span></button><button type="button" class="icon-action" data-action="open-face" data-id="${face.id}" aria-label="${escapeHTML(face.title)} 댓글 ${commentsFor(face).length}개">${icons.comment}<span>${commentsFor(face).length}</span></button></div></div></div>
    </article>`;
  }
  function renderFeed() {
    const faces = allFaces().filter(
      (face) => filter === "all" || face.mood === filter,
    );
    faces.sort((a, b) =>
      sort === "newest"
        ? b.createdAt - a.createdAt
        : sort === "comments"
          ? commentsFor(b).length - commentsFor(a).length ||
            b.createdAt - a.createdAt
          : likeCount(b) - likeCount(a) || b.createdAt - a.createdAt,
    );
    $("#face-grid").innerHTML = faces.length
      ? faces.map(cardHTML).join("")
      : '<div class="empty-state"><h3>아직 이 분위기의 얼굴이 없어요.</h3><p>첫 번째 얼굴을 만들어 이야기를 시작해보세요.</p><button type="button" class="button button-dark" data-action="create">내 얼굴 만들기</button></div>';
    $("#face-count").textContent = pad(allFaces().length);
    $$("[data-filter]").forEach((button) => {
      const selected = button.dataset.filter === filter;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    $("#sort-select").value = sort;
  }
  function setFilter(next) {
    if (next !== "all" && !D.moods.some((m) => m.id === next)) return;
    filter = next;
    renderFeed();
  }
  $("#sort-select").addEventListener("change", (event) => {
    sort = event.target.value;
    renderFeed();
  });
  function toggleLike(id) {
    const face = getFace(id);
    if (!face) return;
    state.likes[id] = !state.likes[id];
    const saved = persist();
    $$(`[data-like-id="${id}"]`).forEach((button) => {
      button.classList.toggle("liked", state.likes[id]);
      button.setAttribute("aria-pressed", String(state.likes[id]));
      $("[data-like-count]", button).textContent = likeCount(face);
    });
    if (sort === "popular") {
      const focused = document.activeElement;
      const grid = $("#face-grid");
      const ordered = allFaces()
        .filter((f) => filter === "all" || f.mood === filter)
        .sort(
          (a, b) => likeCount(b) - likeCount(a) || b.createdAt - a.createdAt,
        );
      ordered.forEach((f) => {
        const card = grid.querySelector(`[data-face-card="${f.id}"]`);
        if (card) grid.appendChild(card);
      });
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    }
    if (!saved)
      toast("이 브라우저에서는 저장할 수 없어, 현재 화면에서만 반영돼요.");
  }
  function vote(id, index) {
    const face = getFace(id);
    if (!face || !Number.isInteger(index) || index < 0 || index > 3) return;
    if (state.votes[id] === index) delete state.votes[id];
    else state.votes[id] = index;
    persist();
    $$("[data-vote]", $("#face-content")).forEach((button) => {
      const i = Number(button.dataset.vote);
      button.classList.toggle("selected", state.votes[id] === i);
      button.setAttribute("aria-pressed", String(state.votes[id] === i));
      $("span", button).textContent = voteCount(face, i);
    });
  }
  function renderComments(face) {
    const comments = commentsFor(face);
    $("#comments-region").innerHTML =
      `<h3>첫인상 이야기 <span>${face.local ? "내 데모 게시물" : "샘플 댓글 포함"}</span></h3>${comments.length ? comments.map((c) => `<article class="comment"><span class="comment-avatar" aria-hidden="true">${escapeHTML(Array.from(c.author)[0] || "핀")}</span><div class="comment-main"><div class="comment-byline"><strong>${escapeHTML(c.author)}</strong><span>${c.local ? "나 · 이 기기" : "샘플"}</span>${c.local ? `<time datetime="${new Date(c.createdAt).toISOString()}">${timeLabel(c.createdAt)}</time><button type="button" class="comment-delete" data-action="delete-comment" data-id="${face.id}" data-comment-id="${c.id}" aria-label="내 댓글 삭제">삭제</button>` : ""}</div><p>${escapeHTML(c.text)}</p></div></article>`).join("") : '<p class="no-comments">아직 첫인상 이야기가 없어요.<br>가장 먼저 이야기를 남겨보세요.</p>'}`;
    $("#detail-comment-count").textContent = `이야기 ${comments.length}개`;
  }
  function openFace(id) {
    const face = getFace(id);
    if (!face) return false;
    activeFaceId = id;
    const liked = !!state.likes[id];
    $("#face-content").innerHTML =
      `<div class="detail-layout"><div class="detail-visual">${portraitHTML(face.portrait, `${face.title} — AI로 만든 가상 인물`)}<p class="eyebrow">FIVE ANSWERS. ONE NEW FACE.</p><div class="detail-answer-tags">${face.answers.map((answer) => `<span>${escapeHTML(answer)}</span>`).join("")}</div><p class="detail-fiction">이 인물은 AI로 생성한 가상 인물입니다.</p></div><div class="detail-content"><div class="detail-heading"><div class="detail-top-row"><span class="eyebrow">FACE NO. ${escapeHTML(face.number)} · ${face.local ? "MY FACE" : "THE FACE CLUB"}</span>${closeButton}</div><h2 id="face-dialog-title">${escapeHTML(face.title)}</h2><p class="detail-meta">by ${escapeHTML(face.author)} · ${face.local ? "이 기기에만 보이는 데모 게시물" : "가상의 크리에이터 · 샘플 게시물"}</p><p class="detail-question">${escapeHTML(face.prompt)}</p><div class="detail-reactions"><button type="button" class="like-pill ${liked ? "liked" : ""}" data-action="like" data-like-id="${id}" data-id="${id}" aria-pressed="${liked}" aria-label="이 얼굴에 좋아요">${icons.heart} 좋아요 <span data-like-count>${likeCount(face)}</span></button><span class="detail-comment-count" id="detail-comment-count"></span></div><div class="impression-vote"><p>딱 하나만 고른다면, 당신의 첫인상은?</p><div class="vote-options" role="group" aria-label="첫인상 투표">${VOTE_LABELS.map((label, i) => `<button type="button" class="vote-option ${state.votes[id] === i ? "selected" : ""}" data-action="vote" data-vote="${i}" data-id="${id}" aria-pressed="${state.votes[id] === i}">${label}<span>${voteCount(face, i)}</span></button>`).join("")}</div></div></div><div class="comments-region" id="comments-region" aria-live="polite"></div><form class="comment-form" id="comment-form"><div class="comment-form-row"><label>닉네임 <input class="comment-name" name="nickname" aria-label="댓글 닉네임" maxlength="16" value="${escapeHTML(state.nickname || "이름없는루커")}" autocomplete="off" required></label><span class="char-count" id="comment-char-count">0 / 300</span></div><div class="comment-compose"><textarea id="comment-text" name="comment" maxlength="300" placeholder="이 얼굴에서 시작된 이야기를 들려주세요." aria-label="첫인상 댓글" required></textarea><button class="comment-submit" id="comment-submit" type="submit" disabled>남기기</button></div><p class="form-error" id="comment-error" role="alert" hidden></p><p class="local-hint">데모 댓글은 이 브라우저에만 저장돼요. 관상은 상상의 이야기로 즐겨주세요.</p></form></div></div>`;
    renderComments(face);
    openModal($("#face-dialog"));
    $("#comment-text").addEventListener("input", (event) => {
      const text = event.target.value;
      $("#comment-char-count").textContent = `${text.length} / 300`;
      $("#comment-submit").disabled = !text.trim();
    });
    $("#comment-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const text = clean($("#comment-text").value, 300),
        author = clean($(".comment-name").value, 16);
      const error = $("#comment-error");
      error.hidden = true;
      if (!text || !author) {
        error.textContent = "닉네임과 이야기를 함께 적어주세요.";
        error.hidden = false;
        return;
      }
      if (localComments(id).length >= MAX_COMMENTS) {
        error.textContent =
          "이 데모에서는 얼굴마다 댓글을 100개까지 저장할 수 있어요.";
        error.hidden = false;
        return;
      }
      const c = {
        id: uid("comment"),
        author,
        text,
        createdAt: Date.now(),
        local: true,
      };
      if (!state.comments[id]) state.comments[id] = [];
      state.comments[id].push(c);
      state.nickname = author;
      const saved = persist();
      renderComments(face);
      renderFeed();
      $("#comment-text").value = "";
      $("#comment-char-count").textContent = "0 / 300";
      $("#comment-submit").disabled = true;
      $("#comments-region").scrollTop = $("#comments-region").scrollHeight;
      $("#comment-text").focus({ preventScroll: true });
      toast(
        saved
          ? "이 브라우저에 이야기를 남겼어요."
          : "현재 화면에 반영했어요. 브라우저 저장 공간을 사용할 수 없어요.",
      );
    });
    return true;
  }
  function deleteComment(id, commentId) {
    if (!getFace(id)) return;
    state.comments[id] = localComments(id).filter((c) => c.id !== commentId);
    persist();
    renderComments(getFace(id));
    renderFeed();
    $("#comment-text")?.focus({ preventScroll: true });
    toast("내 댓글을 삭제했어요.");
  }

  function startStudio(firstAnswer) {
    studio = {
      step: 0,
      answers: Array(5).fill(null),
      variants: Array(5).fill(0),
      stage: "questions",
      result: null,
      published: false,
    };
    if (Number.isInteger(firstAnswer) && firstAnswer >= 0 && firstAnswer < 4) {
      studio.answers[0] = firstAnswer;
      studio.step = 1;
    }
    renderQuestion();
    openModal($("#studio-dialog"));
    $("#studio-dialog-title").focus({ preventScroll: true });
  }
  function questionTitle(step) {
    const q = D.questionGroups[step];
    if (step === 1 && studio.variants[step] === 0 && studio.answers[0] !== null)
      return q.moodTitles[studio.answers[0]];
    return q.titles[studio.variants[step] % q.titles.length];
  }
  function renderQuestion(focus = false) {
    const { step } = studio,
      q = D.questionGroups[step];
    studio.stage = "questions";
    $("#studio-content").innerHTML =
      `${studioHeader}<div class="studio-body"><div class="studio-kicker"><span>${q.label} · ${pad(step + 1)} / 05</span><button type="button" class="studio-reroll" data-action="reroll-question">질문을 다르게 보기</button></div><div class="studio-progress" aria-label="5개 질문 중 ${step + 1}번째">${D.questionGroups.map((_, i) => `<span class="${i <= step ? "done" : ""}"></span>`).join("")}</div><h2 id="studio-dialog-title" tabindex="-1">${escapeHTML(questionTitle(step))}</h2><p class="studio-hint">${q.hint}</p><div class="answer-grid" role="group" aria-label="답변 선택">${q.options.map((option, i) => `<button type="button" class="answer-option ${studio.answers[step] === i ? "selected" : ""}" data-action="select-answer" data-answer="${i}" aria-pressed="${studio.answers[step] === i}"><span class="answer-symbol" aria-hidden="true">${option.symbol}</span><span class="answer-text"><strong>${option.label}</strong><small>${option.sub}</small></span><span class="answer-indicator" aria-hidden="true"></span></button>`).join("")}</div><div class="studio-nav"><button type="button" class="back-button" data-action="previous-question">${step === 0 ? "다음에 할게요" : "이전 질문"}</button><button type="button" class="button button-dark" id="studio-next" data-action="next-question" ${studio.answers[step] === null ? "disabled" : ""}>${step === 4 ? "내 얼굴 만나기" : "다음 질문"}</button></div><p class="studio-demo-note">미리 준비된 질문과 AI 얼굴로 체험하는 데모예요. 실제 사진은 필요하지 않아요.</p></div>`;
    $("#studio-dialog").scrollTop = 0;
    if (focus) $("#studio-dialog-title").focus({ preventScroll: true });
  }
  function selectAnswer(index) {
    if (
      !studio ||
      studio.stage !== "questions" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 3
    )
      return;
    studio.answers[studio.step] = index;
    $$(".answer-option").forEach((button) => {
      const on = Number(button.dataset.answer) === index;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-pressed", String(on));
    });
    $("#studio-next").disabled = false;
  }
  function nextQuestion() {
    if (
      !studio ||
      studio.stage !== "questions" ||
      studio.answers[studio.step] === null
    )
      return;
    if (studio.step < 4) {
      studio.step++;
      renderQuestion(true);
    } else generateResult();
  }
  // This is an explicit local sample matcher, not an AI generation API.
  // Every answer contributes to the score. The first answer determines the mood.
  function matchPortrait(answers) {
    const weights = [12, 2, 4, 3, 2];
    let best = D.portraits[0],
      bestScore = -1;
    D.portraits.forEach((p) => {
      const score = p.signature.reduce(
        (sum, v, i) => sum + (v === answers[i] ? weights[i] : 0),
        0,
      );
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    });
    return best;
  }
  function generateResult() {
    if (!studio || studio.answers.some((a) => a === null)) return;
    studio.stage = "loading";
    studio.result = matchPortrait(studio.answers);
    $("#studio-content").innerHTML =
      `${studioHeader}<div class="loading-body" aria-live="polite"><div class="loading-mark" aria-hidden="true">✳</div><p class="eyebrow">FINDING YOUR FACE</p><h2 id="studio-dialog-title">당신의 답을 한 장면으로.</h2><p>다섯 가지 선택을 모아<br>준비된 AI 얼굴 중 어울리는 인상을 찾고 있어요.</p><div class="loading-track" role="progressbar" aria-label="데모 얼굴을 준비하는 중"><span></span></div><p class="studio-demo-note">실시간 AI 생성이 아닌 데모 결과입니다.</p></div>`;
    generationTimer = setTimeout(() => {
      generationTimer = null;
      if ($("#studio-dialog").open && studio?.stage === "loading")
        renderResult();
    }, 1500);
  }
  function renderResult() {
    studio.stage = "result";
    const p = studio.result,
      mood = D.moods[studio.answers[0]];
    const answers = studio.answers.map(
      (answer, i) => D.questionGroups[i].options[answer].label,
    );
    $("#studio-content").innerHTML =
      `${studioHeader}<div class="result-layout"><div class="result-portrait-wrap">${portraitHTML(p.index, "답변으로 선택한 AI 가상 얼굴")}<span class="result-stamp">100% FICTIONAL · YOUR NEW FACE</span></div><div class="result-copy"><p class="eyebrow orange">MEET YOUR NEW POSSIBILITY</p><h2 id="studio-dialog-title" tabindex="-1">${p.name}</h2><p class="result-description">${p.description}</p><div class="answer-summary">${answers.map((answer) => `<span>${escapeHTML(answer)}</span>`).join("")}</div><form id="publish-form"><label class="field-label" for="post-title">이 얼굴에 붙일 제목</label><input class="text-input" id="post-title" name="title" maxlength="48" value="${escapeHTML(mood.title)}" required><label class="field-label" for="post-nickname">크리에이터 닉네임</label><input class="text-input" id="post-nickname" name="nickname" maxlength="16" value="${escapeHTML(state.nickname || "이름없는루커")}" required autocomplete="off"><p class="form-error" id="publish-error" role="alert" hidden></p><button type="submit" class="button button-dark result-publish"><span aria-hidden="true">＋</span> 데모 피드에 올리기</button></form><button type="button" class="result-secondary" data-action="restart-studio">다른 답으로 다시 만나기</button><p class="local-hint">준비된 AI 얼굴 6종 중 답변에 맞춰 선택한 결과예요. 게시물은 이 브라우저에만 저장되며 다른 방문자에게 공개되지 않아요.</p></div></div>`;
    $("#studio-dialog").scrollTop = 0;
    $("#studio-dialog-title").focus({ preventScroll: true });
    $("#publish-form").addEventListener("submit", (event) => {
      event.preventDefault();
      publishResult();
    });
  }
  function publishResult() {
    if (!studio || studio.stage !== "result" || studio.published) return;
    const title = clean($("#post-title").value, 48),
      author = clean($("#post-nickname").value, 16),
      error = $("#publish-error");
    if (!title || !author) {
      error.textContent = "제목과 닉네임을 함께 적어주세요.";
      error.hidden = false;
      return;
    }
    if (state.posts.length >= MAX_POSTS) {
      error.textContent = "이 데모에서는 얼굴을 48개까지 저장할 수 있어요.";
      error.hidden = false;
      return;
    }
    const mood = D.moods[studio.answers[0]];
    const face = {
      id: uid("local"),
      number: "YOU",
      portrait: studio.result.index,
      mood: mood.id,
      title,
      author,
      quote: "“이 얼굴의 이야기를 들려주세요.”",
      tags: [...mood.tags],
      likes: 0,
      votes: [0, 0, 0, 0],
      comments: [],
      answers: studio.answers.map(
        (answer, i) => D.questionGroups[i].options[answer].label,
      ),
      prompt:
        "다섯 가지 답으로 만나본 새로운 얼굴이에요. 어떤 첫인상이 떠오르나요?",
      createdAt: Date.now(),
      local: true,
    };
    studio.published = true;
    state.posts.unshift(face);
    state.nickname = author;
    const saved = persist();
    filter = "all";
    sort = "newest";
    renderFeed();
    closeModal($("#studio-dialog"));
    openFace(face.id);
    toast(
      saved
        ? "내 데모 얼굴을 이 브라우저에 저장했어요."
        : "현재 화면에 얼굴을 올렸어요. 브라우저에는 저장할 수 없어요.",
    );
  }
  function showInfo(kind = "about") {
    const about = kind === "about";
    $("#info-content").innerHTML =
      `<div class="modal-header"><div class="modal-brand"><span class="modal-wordmark">lukory<span class="orange">.</span></span></div>${closeButton}</div><div class="info-body"><p class="eyebrow orange">${about ? "THE FIRST IMPRESSION CLUB" : "A LITTLE NOTE ON THIS DEMO"}</p><h2 id="info-dialog-title">${about ? "같은 얼굴을 보고도,<br>우리는 다른 이야기를 해요." : "지금은, 가능성을<br>체험하는 버전이에요."}</h2>${about ? '<p><strong>LUKORY(루코리)</strong>는 얼굴을 바라보는 <strong>look</strong>과 각자의 이야기인 <strong>story</strong>를 섞어 만든 이름이에요. 하나의 얼굴에서 시작된 서로 다른 첫인상이 모이는 곳이라는 뜻을 담았어요.</p><ol class="info-steps"><li><span>01</span><div><strong>사진 대신, 다섯 가지 질문</strong><br>지금의 취향과 상상에 가까운 답을 골라요.</div></li><li><span>02</span><div><strong>아직 존재하지 않는 얼굴</strong><br>답변에서 출발한 새로운 인상을 만나요.</div></li><li><span>03</span><div><strong>첫인상은 당신의 이야기</strong><br>한 얼굴을 보고 떠오른 각자의 관상을 나눠요.</div></li></ol><p class="info-small">루코리의 얼굴은 모두 가상 인물이에요. 관상은 재미있는 상상의 이야기로 즐겨주세요. 실제 성격이나 미래를 판별하는 서비스는 아니에요.</p><button type="button" class="button button-dark" data-action="create">나도 질문에 답해보기</button>' : '<p>질문에서 얼굴을 만나고, 피드에 올리고, 댓글을 남기는 흐름을 체험할 수 있어요.</p><ol class="info-steps"><li><span>01</span><div><strong>미리 준비한 AI 질문과 얼굴</strong><br>질문은 준비된 문항을 활용하며, 답변으로 AI 얼굴 6종 중 하나를 선택해요. 지금은 실시간 AI 생성을 호출하지 않아요.</div></li><li><span>02</span><div><strong>댓글과 반응은 내 브라우저에</strong><br>직접 남긴 게시물·댓글·좋아요·투표는 이 브라우저에 저장돼요. 다른 방문자와 공유되지는 않아요.</div></li><li><span>03</span><div><strong>커뮤니티의 모습은 샘플로</strong><br>기본 얼굴 게시물의 작성자·댓글·반응 수는 모두 가상의 예시예요.</div></li></ol><p class="info-small">브라우저 데이터를 삭제하거나 다른 기기에서 열면 이전 기록이 보이지 않을 수 있어요. 저장이 제한된 환경에서는 페이지를 닫을 때 기록이 사라져요.</p>'}</div>`;
    openModal($("#info-dialog"));
  }
  document.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      setFilter(filterButton.dataset.filter);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action,
      id = button.dataset.id;
    switch (action) {
      case "close":
        closeModal(button.closest("dialog"));
        break;
      case "create":
        startStudio();
        break;
      case "begin-answer":
        startStudio(Number(button.dataset.answer));
        break;
      case "about":
        showInfo();
        break;
      case "demo-info":
        showInfo("demo");
        break;
      case "open-face":
        openFace(id);
        break;
      case "like":
        toggleLike(id);
        break;
      case "vote":
        vote(id, Number(button.dataset.vote));
        break;
      case "delete-comment":
        deleteComment(id, button.dataset.commentId);
        break;
      case "select-answer":
        selectAnswer(Number(button.dataset.answer));
        break;
      case "next-question":
        nextQuestion();
        break;
      case "previous-question":
        if (!studio) return;
        if (studio.step === 0) closeModal($("#studio-dialog"));
        else {
          studio.step--;
          renderQuestion(true);
        }
        break;
      case "reroll-question":
        if (!studio) return;
        studio.variants[studio.step]++;
        renderQuestion(true);
        break;
      case "restart-studio":
        startStudio();
        break;
    }
  });
  renderFeed();

  // Progressive enhancement: browsers without WebMCP simply skip registration.
  const modelContext = document.modelContext;
  if (modelContext?.registerTool) {
    const lifetime = new AbortController();
    const tools = [
      {
        name: "list_lukory_faces",
        title: "루코리 얼굴 목록",
        description:
          "Read the fictional sample faces and device-local demo posts currently available. Does not infer real traits.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (
            input === null ||
            typeof input !== "object" ||
            Object.keys(input).length
          )
            throw new Error("Expected an empty object.");
          return {
            demo: true,
            faces: allFaces().map((f) => ({
              id: f.id,
              title: f.title,
              mood: f.mood,
              local: !!f.local,
            })),
          };
        },
      },
      {
        name: "open_lukory_face",
        title: "루코리 얼굴과 댓글 보기",
        description:
          "Open one existing fictional face and its comments. Does not post or like.",
        inputSchema: {
          type: "object",
          properties: { faceId: { type: "string" } },
          required: ["faceId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          if (
            !input ||
            typeof input.faceId !== "string" ||
            Object.keys(input).some((k) => k !== "faceId") ||
            !getFace(input.faceId)
          )
            throw new Error("Unknown faceId.");
          openFace(input.faceId);
          return { opened: true, faceId: activeFaceId };
        },
      },
      {
        name: "start_lukory_questionnaire",
        title: "루코리 질문 시작",
        description:
          "Start the local five-question face demo. Does not generate an AI image or publish a post.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (
            input === null ||
            typeof input !== "object" ||
            Object.keys(input).length
          )
            throw new Error("Expected an empty object.");
          startStudio();
          return { started: true, question: 1, total: 5, demo: true };
        },
      },
    ];
    tools.forEach((tool) => {
      try {
        Promise.resolve(
          modelContext.registerTool(tool, { signal: lifetime.signal }),
        ).catch(() => {});
      } catch {
        /* optional browser support */
      }
    });
    window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
  }
})();
