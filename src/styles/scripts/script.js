/* =====================================================
   V3 Family Feed — Full-Featured Script
   ===================================================== */
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let db, currentUser, pendingDeleteId, storyProgressTimer;
let allPosts = [];
let currentSearch = '';
let currentTab = 'feed';
let editingPostId = null;
let selectedTag = null;
let realtimeChannel;

/* ── Init ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  db = createClient(SB_URL, SB_KEY);
  applyTheme();
  setupAuth();
  bindGlobalUI();
});

/* ── Theme ──────────────────────────────────────── */
function applyTheme() {
  const saved = localStorage.getItem('v3-theme') || 'dark';
  document.body.classList.toggle('light', saved === 'light');
  updateThemeIcon(saved);
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  const theme = isLight ? 'light' : 'dark';
  localStorage.setItem('v3-theme', theme);
  updateThemeIcon(theme);
  showToast(`${isLight ? 'Light' : 'Dark'} mode on`, 'info');
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (icon) icon.textContent = theme === 'light' ? 'dark_mode' : 'light_mode';
}

/* ── Auth ───────────────────────────────────────── */
function setupAuth() {
  db.auth.onAuthStateChange((event, session) => {
    (async () => {
      currentUser = session?.user || null;
      if (currentUser) {
        onSignedIn();
      } else {
        onSignedOut();
      }
    })();
  });
}

async function onSignedIn() {
  showApp();
  setUserChip(currentUser.email);
  setPostModalAuthor(currentUser.email);
  showSkeletons();
  await Promise.all([loadFeed(), loadStories()]);
  setupRealtime();
  loadNotifications();
}

function onSignedOut() {
  showAuth();
  teardownRealtime();
  allPosts = [];
  document.getElementById('feed').innerHTML = '';
  document.getElementById('storiesRow').innerHTML = buildStoryAddBtn();
}

/* Auth form handlers */
document.getElementById('loginBtn').addEventListener('click', async () => {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) { showToast('Fill in all fields', 'error'); return; }
  setLoading('loginBtn', true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  setLoading('loginBtn', false);
  if (error) showToast(error.message, 'error');
});

document.getElementById('signupBtn').addEventListener('click', async () => {
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!email || !password) { showToast('Fill in all fields', 'error'); return; }
  if (password.length < 6) { showToast('Password must be 6+ chars', 'error'); return; }
  setLoading('signupBtn', true);
  const { error } = await db.auth.signUp({ email, password });
  setLoading('signupBtn', false);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Account created! Signed in.', 'success');
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await db.auth.signOut();
  showToast('Signed out', 'info');
});

document.getElementById('switchToSignup').addEventListener('click', () => {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('signupForm').classList.remove('hidden');
});

document.getElementById('switchToLogin').addEventListener('click', () => {
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
});

document.getElementById('passwordToggle').addEventListener('click', () => {
  const inp  = document.getElementById('password');
  const icon = document.querySelector('#passwordToggle .material-icons-round');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
});

/* ── Tabs ────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll('.tab-btn').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive);
  });

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.remove('hidden');

  if (tab === 'events') loadEvents();
  if (tab === 'gallery') loadGallery();
  if (tab === 'members') loadMembers();
}

/* ── Feed ────────────────────────────────────────── */
async function loadFeed() {
  const { data, error } = await db
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { showToast('Failed to load posts', 'error'); return; }
  allPosts = data || [];
  renderFeed(allPosts);
}

function renderFeed(posts) {
  const feed       = document.getElementById('feed');
  const pinnedFeed = document.getElementById('pinned-feed');
  const pinnedSec  = document.getElementById('pinned-section');
  const emptyState = document.getElementById('emptyState');

  const filtered = currentSearch
    ? posts.filter(p =>
        p.content?.toLowerCase().includes(currentSearch.toLowerCase()) ||
        p.author?.toLowerCase().includes(currentSearch.toLowerCase()) ||
        (p.tags || []).some(t => t.toLowerCase().includes(currentSearch.toLowerCase()))
      )
    : posts;

  const pinned  = filtered.filter(p => p.pinned);
  const regular = filtered.filter(p => !p.pinned);

  /* Pinned */
  if (pinned.length > 0) {
    pinnedSec.classList.remove('hidden');
    pinnedFeed.innerHTML = pinned.map((p, i) => buildPostCard(p, i, true)).join('');
  } else {
    pinnedSec.classList.add('hidden');
    pinnedFeed.innerHTML = '';
  }

  /* Regular */
  if (regular.length === 0 && pinned.length === 0) {
    feed.innerHTML = '';
    if (currentSearch) {
      feed.innerHTML = `<div class="no-results">No posts for "<strong>${escHtml(currentSearch)}</strong>"</div>`;
      emptyState.classList.add('hidden');
    } else {
      emptyState.classList.remove('hidden');
    }
    return;
  }

  emptyState.classList.add('hidden');
  feed.innerHTML = regular.map((p, i) => buildPostCard(p, i, false)).join('');
  bindPostEvents();
  if (pinned.length > 0) bindPostEventsIn(pinnedFeed);
}

function buildPostCard(post, idx, isPinned) {
  const initials  = getInitials(post.author);
  const color     = getAvatarColor(post.author);
  const name      = formatName(post.author);
  const time      = formatTime(post.created_at);
  const reactions = post.reactions || { like: [], love: [], laugh: [] };
  const myEmail   = currentUser?.email || '';
  const isOwn     = post.author === myEmail;
  const tags      = post.tags || [];

  const likeClass  = reactions.like?.includes(myEmail)  ? 'reacted like'  : '';
  const loveClass  = reactions.love?.includes(myEmail)  ? 'reacted love'  : '';
  const laughClass = reactions.laugh?.includes(myEmail) ? 'reacted laugh' : '';

  return `
    <div class="post-card${post.pinned ? ' pinned' : ''}" id="post-${post.id}" style="animation-delay:${idx * 55}ms">
      ${post.pinned ? `<div class="pin-indicator"><span class="material-icons-round">push_pin</span>Pinned</div>` : ''}
      <div class="post-header">
        <div class="post-author-group">
          <div class="post-avatar" style="background:${color}">${initials}</div>
          <div class="post-author-info">
            <span class="post-author-name">${escHtml(name)}</span>
            <span class="post-timestamp">${time}</span>
          </div>
        </div>
        ${isOwn ? `
        <div class="post-options-wrap">
          <button class="post-options-btn" data-id="${post.id}" aria-label="Options">
            <span class="material-icons-round">more_horiz</span>
          </button>
          <div class="post-options-menu hidden" id="menu-${post.id}">
            <button class="post-menu-item" data-edit="${post.id}">
              <span class="material-icons-round">edit</span>Edit
            </button>
            <button class="post-menu-item" data-pin="${post.id}" data-pinned="${post.pinned}">
              <span class="material-icons-round">${post.pinned ? 'push_pin' : 'push_pin'}</span>
              ${post.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button class="post-menu-item danger" data-delete="${post.id}">
              <span class="material-icons-round">delete_outline</span>Delete
            </button>
          </div>
        </div>` : ''}
      </div>

      ${tags.length > 0 ? `
        <div class="post-tags">
          ${tags.map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('')}
        </div>` : ''}

      ${post.content ? `<div class="post-body">${escHtml(post.content)}</div>` : ''}

      ${post.image_url ? `
        <img class="post-image" src="${escHtml(post.image_url)}" alt="Post image"
             loading="lazy" data-lightbox="${escHtml(post.image_url)}">` : ''}

      <div class="reactions-bar">
        <button class="reaction-btn like ${likeClass}" data-react="${post.id}" data-type="like">
          <span class="reaction-emoji">👍</span>
          <span class="reaction-count">${reactions.like?.length || 0}</span>
        </button>
        <button class="reaction-btn love ${loveClass}" data-react="${post.id}" data-type="love">
          <span class="reaction-emoji">❤️</span>
          <span class="reaction-count">${reactions.love?.length || 0}</span>
        </button>
        <button class="reaction-btn laugh ${laughClass}" data-react="${post.id}" data-type="laugh">
          <span class="reaction-emoji">😂</span>
          <span class="reaction-count">${reactions.laugh?.length || 0}</span>
        </button>
      </div>

      <div class="reply-section">
        <button class="reply-toggle-btn" data-toggle="${post.id}">
          <span class="material-icons-round">chat_bubble_outline</span>
          <span class="reply-count-label" id="reply-count-${post.id}">Comments</span>
          <span class="material-icons-round" style="margin-left:auto;font-size:14px" id="chevron-${post.id}">expand_more</span>
        </button>
        <div class="replies-container" id="replies-${post.id}">
          <div class="replies-list" id="replies-list-${post.id}"></div>
          <div class="reply-input-row">
            <input type="text" id="reply-input-${post.id}" placeholder="Add a comment..." maxlength="500">
            <button class="reply-send-btn" data-reply="${post.id}" aria-label="Send">
              <span class="material-icons-round">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindPostEvents() { bindPostEventsIn(document.getElementById('feed')); }

function bindPostEventsIn(container) {
  container.querySelectorAll('[data-react]').forEach(btn =>
    btn.addEventListener('click', () => reactToPost(btn.dataset.react, btn.dataset.type, btn))
  );
  container.querySelectorAll('[data-toggle]').forEach(btn =>
    btn.addEventListener('click', () => toggleReplies(btn.dataset.toggle))
  );
  container.querySelectorAll('[data-reply]').forEach(btn =>
    btn.addEventListener('click', () => sendReply(btn.dataset.reply))
  );
  container.querySelectorAll('[id^="reply-input-"]').forEach(inp =>
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) sendReply(inp.id.replace('reply-input-', ''));
    })
  );
  container.querySelectorAll('.post-options-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.post-options-menu').forEach(m => m.classList.add('hidden'));
      document.getElementById('menu-' + btn.dataset.id)?.classList.toggle('hidden');
    })
  );
  container.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      pendingDeleteId = btn.dataset.delete;
      openModal('delete-modal');
    })
  );
  container.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditPost(btn.dataset.edit);
    })
  );
  container.querySelectorAll('[data-pin]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      togglePin(btn.dataset.pin, btn.dataset.pinned === 'true');
    })
  );
  container.querySelectorAll('[data-lightbox]').forEach(img =>
    img.addEventListener('click', () => openLightbox(img.dataset.lightbox))
  );
}

document.addEventListener('click', () => {
  document.querySelectorAll('.post-options-menu').forEach(m => m.classList.add('hidden'));
});

/* ── Reactions ───────────────────────────────────── */
async function reactToPost(postId, type, btn) {
  if (!currentUser) { showToast('Sign in to react', 'error'); return; }
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;

  const reactions = JSON.parse(JSON.stringify(post.reactions || { like:[], love:[], laugh:[] }));
  const email = currentUser.email;
  const arr = reactions[type] || [];
  const idx = arr.indexOf(email);
  if (idx === -1) arr.push(email); else arr.splice(idx, 1);
  reactions[type] = arr;
  post.reactions = reactions;

  const { error } = await db.from('posts').update({ reactions }).eq('id', postId);
  if (error) { showToast('Failed to react', 'error'); return; }

  btn.classList.toggle('reacted');
  btn.classList.toggle(type);
  btn.classList.add('pop');
  btn.querySelector('.reaction-count').textContent = arr.length;
  setTimeout(() => btn.classList.remove('pop'), 350);
}

/* ── Replies ─────────────────────────────────────── */
async function toggleReplies(postId) {
  const container = document.getElementById('replies-' + postId);
  const chevron   = document.getElementById('chevron-' + postId);
  const isOpen    = container.classList.contains('open');
  if (!isOpen) {
    container.classList.add('open');
    chevron.textContent = 'expand_less';
    await loadReplies(postId);
  } else {
    container.classList.remove('open');
    chevron.textContent = 'expand_more';
  }
}

async function loadReplies(postId) {
  const list = document.getElementById('replies-list-' + postId);
  list.innerHTML = '<div class="skeleton-line" style="height:36px;border-radius:8px;margin:8px 0"></div>';

  const { data, error } = await db.from('replies').select('*')
    .eq('post_id', postId).order('created_at', { ascending: true });

  if (error) { list.innerHTML = '<p style="color:var(--red);font-size:13px;padding:8px 0">Failed to load</p>'; return; }

  const label = document.getElementById('reply-count-' + postId);
  if (label) label.textContent = data.length > 0 ? `${data.length} Comment${data.length !== 1 ? 's' : ''}` : 'Comments';

  if (data.length === 0) {
    list.innerHTML = '<p style="color:var(--text-3);font-size:13px;padding:8px 0;text-align:center">No comments yet</p>';
    return;
  }

  list.innerHTML = data.map(r => `
    <div class="reply-item">
      <div class="reply-avatar" style="background:${getAvatarColor(r.author)}">${getInitials(r.author)}</div>
      <div class="reply-content">
        <div class="reply-author">${escHtml(formatName(r.author))}</div>
        <div class="reply-text">${escHtml(r.content)}</div>
        <div class="reply-time">${formatTime(r.created_at)}</div>
      </div>
    </div>
  `).join('');
}

async function sendReply(postId) {
  const inp = document.getElementById('reply-input-' + postId);
  const content = inp.value.trim();
  if (!content || !currentUser) return;
  inp.value = '';
  const { error } = await db.from('replies').insert({ post_id: postId, author: currentUser.email, content });
  if (error) { showToast('Failed to comment', 'error'); return; }
  await loadReplies(postId);
  showToast('Comment added!', 'success');
}

/* ── Create Post ─────────────────────────────────── */
let postImageBase64 = null;

document.getElementById('postImage').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Max 5MB image', 'error'); return; }
  postImageBase64 = await fileToBase64(file);
  document.getElementById('imagePreview').src = postImageBase64;
  document.getElementById('imagePreviewWrap').classList.remove('hidden');
});

document.getElementById('removeImageBtn').addEventListener('click', () => {
  postImageBase64 = null;
  document.getElementById('imagePreviewWrap').classList.add('hidden');
  document.getElementById('postImage').value = '';
});

/* Tag selector */
document.querySelectorAll('.tag-option').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('selected')) {
      btn.classList.remove('selected');
      selectedTag = null;
    } else {
      document.querySelectorAll('.tag-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTag = btn.dataset.tag;
    }
  });
});

document.getElementById('postBtn').addEventListener('click', async () => {
  const content = document.getElementById('postContent').value.trim();
  if (!content && !postImageBase64) { showToast('Write something or add a photo', 'error'); return; }

  setLoading('postBtn', true);

  if (editingPostId) {
    const { error } = await db.from('posts').update({
      content,
      tags: selectedTag ? [selectedTag] : [],
      image_url: postImageBase64 || null
    }).eq('id', editingPostId);
    setLoading('postBtn', false);
    if (error) { showToast('Failed to update', 'error'); return; }
    showToast('Post updated!', 'success');
    editingPostId = null;
  } else {
    const { error } = await db.from('posts').insert({
      author: currentUser.email,
      content,
      image_url: postImageBase64 || null,
      tags: selectedTag ? [selectedTag] : [],
      reactions: { like: [], love: [], laugh: [] }
    });
    setLoading('postBtn', false);
    if (error) { showToast('Failed to post', 'error'); return; }
    showToast('Posted!', 'success');
  }

  resetPostModal();
  closeModal('post-creator-modal');
  await loadFeed();
});

function resetPostModal() {
  document.getElementById('postContent').value = '';
  postImageBase64 = null;
  document.getElementById('imagePreviewWrap').classList.add('hidden');
  document.getElementById('postImage').value = '';
  document.querySelectorAll('.tag-option').forEach(b => b.classList.remove('selected'));
  selectedTag = null;
  editingPostId = null;
  document.getElementById('postModalTitle').textContent = 'New Post';
  document.getElementById('postBtn').innerHTML = '<span class="material-icons-round">send</span>Share';
}

function openEditPost(postId) {
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;
  editingPostId = postId;

  document.getElementById('postModalTitle').textContent = 'Edit Post';
  document.getElementById('postBtn').innerHTML = '<span class="material-icons-round">save</span>Save';
  document.getElementById('postContent').value = post.content || '';

  if (post.image_url) {
    postImageBase64 = post.image_url;
    document.getElementById('imagePreview').src = post.image_url;
    document.getElementById('imagePreviewWrap').classList.remove('hidden');
  }

  const tag = (post.tags || [])[0];
  if (tag) {
    selectedTag = tag;
    document.querySelectorAll('.tag-option').forEach(b => {
      b.classList.toggle('selected', b.dataset.tag === tag);
    });
  }

  openModal('post-creator-modal');
  document.querySelectorAll('.post-options-menu').forEach(m => m.classList.add('hidden'));
}

/* ── Pin Posts ───────────────────────────────────── */
async function togglePin(postId, isPinned) {
  const { error } = await db.from('posts').update({ pinned: !isPinned }).eq('id', postId);
  document.querySelectorAll('.post-options-menu').forEach(m => m.classList.add('hidden'));
  if (error) { showToast('Failed to pin', 'error'); return; }
  showToast(isPinned ? 'Post unpinned' : 'Post pinned!', 'info');
  await loadFeed();
}

/* ── Delete Post ─────────────────────────────────── */
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const { error } = await db.from('posts').delete().eq('id', pendingDeleteId);
  closeModal('delete-modal');
  if (error) { showToast('Failed to delete', 'error'); return; }
  showToast('Post deleted', 'info');
  allPosts = allPosts.filter(p => p.id !== pendingDeleteId);
  renderFeed(allPosts);
  pendingDeleteId = null;
});
document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
  closeModal('delete-modal');
  pendingDeleteId = null;
});

/* ── Stories ─────────────────────────────────────── */
let storyImageBase64 = null;

async function loadStories() {
  const now = new Date().toISOString();
  const { data } = await db.from('stories').select('*').gt('expires_at', now).order('created_at', { ascending: false });
  renderStories(data || []);
}

function renderStories(stories) {
  const row = document.getElementById('storiesRow');
  const addBtn = buildStoryAddBtn();

  if (stories.length === 0) { row.innerHTML = addBtn; bindStoryAddBtn(); return; }

  row.innerHTML = addBtn + stories.map(s => `
    <div class="story-bubble" data-story='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
      <div class="story-ring">
        <div class="story-ring-inner">
          <img src="${escHtml(s.image_url)}" alt="${escHtml(formatName(s.author))}" loading="lazy">
        </div>
      </div>
      <span class="story-label">${escHtml(formatName(s.author).split(' ')[0])}</span>
    </div>
  `).join('');

  document.querySelectorAll('.story-bubble').forEach(el =>
    el.addEventListener('click', () => viewStory(JSON.parse(el.dataset.story.replace(/&#39;/g, "'"))))
  );
  bindStoryAddBtn();
}

function buildStoryAddBtn() {
  return `<div class="story-add-btn" id="storyAddBtn"><div class="story-add-icon"><span class="material-icons-round">add</span></div><span class="story-label">Your Story</span></div>`;
}

function bindStoryAddBtn() {
  const btn = document.getElementById('storyAddBtn');
  if (btn) btn.addEventListener('click', () => openModal('story-creator-modal'));
}

document.getElementById('storyUploadZone').addEventListener('click', () => document.getElementById('storyImage').click());

document.getElementById('storyImage').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { showToast('Max 8MB image', 'error'); return; }
  storyImageBase64 = await fileToBase64(file);
  document.getElementById('storyImgPreview').src = storyImageBase64;
  document.getElementById('storyImgPreviewWrap').classList.remove('hidden');
  document.getElementById('storyUploadZone').classList.add('hidden');
});

document.getElementById('removeStoryImageBtn').addEventListener('click', () => {
  storyImageBase64 = null;
  document.getElementById('storyImgPreviewWrap').classList.add('hidden');
  document.getElementById('storyUploadZone').classList.remove('hidden');
  document.getElementById('storyImage').value = '';
});

document.getElementById('storyBtn').addEventListener('click', async () => {
  if (!storyImageBase64) { showToast('Please add a photo', 'error'); return; }
  const caption = document.getElementById('storyCaption').value.trim();
  setLoading('storyBtn', true);
  const { error } = await db.from('stories').insert({ author: currentUser.email, image_url: storyImageBase64, caption });
  setLoading('storyBtn', false);
  if (error) { showToast('Failed to add story', 'error'); return; }
  storyImageBase64 = null;
  document.getElementById('storyImgPreviewWrap').classList.add('hidden');
  document.getElementById('storyUploadZone').classList.remove('hidden');
  document.getElementById('storyCaption').value = '';
  document.getElementById('storyImage').value = '';
  closeModal('story-creator-modal');
  showToast('Story shared!', 'success');
  await loadStories();
});

/* Story viewer */
const STORY_DURATION = 5000;

function viewStory(story) {
  document.getElementById('storyViewerImg').src = story.image_url;
  document.getElementById('storyViewerCaption').textContent = story.caption || '';
  document.getElementById('storyViewerName').textContent = formatName(story.author);
  document.getElementById('storyViewerTime').textContent = formatTime(story.created_at);
  const avatar = document.getElementById('storyViewerAvatar');
  avatar.style.background = getAvatarColor(story.author);
  avatar.textContent = getInitials(story.author);
  const fill = document.getElementById('storyProgressFill');
  fill.style.transition = 'none';
  fill.style.width = '0%';
  document.getElementById('story-viewer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    fill.style.transition = `width ${STORY_DURATION}ms linear`;
    fill.style.width = '100%';
  });
  clearTimeout(storyProgressTimer);
  storyProgressTimer = setTimeout(closeStoryViewer, STORY_DURATION);
}

function closeStoryViewer() {
  document.getElementById('story-viewer').classList.add('hidden');
  document.body.style.overflow = '';
  clearTimeout(storyProgressTimer);
}
document.getElementById('storyViewerClose').addEventListener('click', closeStoryViewer);
document.getElementById('storyViewerBackdrop').addEventListener('click', closeStoryViewer);

/* ── Events ──────────────────────────────────────── */
async function loadEvents() {
  document.getElementById('events-list').innerHTML = '<div style="padding:24px 20px;display:flex;flex-direction:column;gap:14px">' +
    [1,2].map(() => '<div class="skeleton-card" style="margin:0"><div class="skeleton-body"></div><div class="skeleton-line medium" style="margin-top:8px"></div></div>').join('') + '</div>';

  const now = new Date().toISOString();
  const { data, error } = await db.from('events').select('*')
    .gte('event_date', now).order('event_date', { ascending: true });

  if (error) { showToast('Failed to load events', 'error'); return; }
  renderEvents(data || []);
  updateEventsBadge(data?.length || 0);
}

function renderEvents(events) {
  const list  = document.getElementById('events-list');
  const empty = document.getElementById('eventsEmptyState');

  if (events.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = events.map((ev, i) => buildEventCard(ev, i)).join('');
  bindEventActions();
}

function buildEventCard(ev, idx) {
  const rsvps    = ev.rsvps || { yes: [], no: [], maybe: [] };
  const myEmail  = currentUser?.email || '';
  const myRsvp   = rsvps.yes?.includes(myEmail) ? 'yes' : rsvps.no?.includes(myEmail) ? 'no' : rsvps.maybe?.includes(myEmail) ? 'maybe' : '';
  const evDate   = new Date(ev.event_date);
  const dateStr  = evDate.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  const timeStr  = evDate.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  const isOwn    = ev.author === myEmail;

  return `
    <div class="event-card" style="animation-delay:${idx * 60}ms">
      <div class="event-date-strip">
        <span class="material-icons-round">calendar_today</span>
        ${escHtml(dateStr)} at ${escHtml(timeStr)}
      </div>
      <div class="event-body">
        <div class="event-title">${escHtml(ev.title)}</div>
        <div class="event-meta">
          ${ev.location ? `<div class="event-meta-row"><span class="material-icons-round">place</span>${escHtml(ev.location)}</div>` : ''}
          <div class="event-meta-row">
            <span class="material-icons-round">person</span>
            Organized by ${escHtml(formatName(ev.author))}
          </div>
        </div>
        ${ev.description ? `<div class="event-desc">${escHtml(ev.description)}</div>` : ''}
        <div class="event-rsvp">
          <button class="rsvp-btn yes ${myRsvp === 'yes' ? 'active' : ''}" data-rsvp="${ev.id}" data-type="yes">✅ Going (${rsvps.yes?.length || 0})</button>
          <button class="rsvp-btn maybe ${myRsvp === 'maybe' ? 'active' : ''}" data-rsvp="${ev.id}" data-type="maybe">🤔 Maybe (${rsvps.maybe?.length || 0})</button>
          <button class="rsvp-btn no ${myRsvp === 'no' ? 'active' : ''}" data-rsvp="${ev.id}" data-type="no">❌ No (${rsvps.no?.length || 0})</button>
          ${isOwn ? `<button class="rsvp-btn" data-delete-event="${ev.id}" style="margin-left:auto;color:var(--red)">🗑️</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function bindEventActions() {
  document.querySelectorAll('[data-rsvp]').forEach(btn => {
    btn.addEventListener('click', () => rsvpEvent(btn.dataset.rsvp, btn.dataset.type));
  });
  document.querySelectorAll('[data-delete-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await db.from('events').delete().eq('id', btn.dataset.deleteEvent);
      if (!error) { showToast('Event deleted', 'info'); await loadEvents(); }
    });
  });
}

async function rsvpEvent(eventId, type) {
  const { data: ev } = await db.from('events').select('rsvps').eq('id', eventId).maybeSingle();
  if (!ev) return;
  const rsvps = JSON.parse(JSON.stringify(ev.rsvps || { yes:[], no:[], maybe:[] }));
  const email = currentUser.email;
  ['yes','no','maybe'].forEach(k => {
    rsvps[k] = (rsvps[k] || []).filter(e => e !== email);
  });
  if (!rsvps[type].includes(email)) rsvps[type].push(email);
  const { error } = await db.from('events').update({ rsvps }).eq('id', eventId);
  if (!error) { showToast('RSVP updated!', 'success'); await loadEvents(); }
}

/* Event creator */
document.getElementById('createEventBtn').addEventListener('click', () => openModal('event-creator-modal'));
document.getElementById('eventsEmptyCreateBtn').addEventListener('click', () => openModal('event-creator-modal'));
document.getElementById('closeEventModal').addEventListener('click', () => closeModal('event-creator-modal'));

document.getElementById('eventBtn').addEventListener('click', async () => {
  const title    = document.getElementById('eventTitle').value.trim();
  const date     = document.getElementById('eventDate').value;
  const location = document.getElementById('eventLocation').value.trim();
  const desc     = document.getElementById('eventDesc').value.trim();

  if (!title) { showToast('Event name required', 'error'); return; }
  if (!date)  { showToast('Date & time required', 'error'); return; }

  setLoading('eventBtn', true);
  const { error } = await db.from('events').insert({
    title, event_date: new Date(date).toISOString(), location, description: desc,
    author: currentUser.email,
    rsvps: { yes: [], no: [], maybe: [] }
  });
  setLoading('eventBtn', false);
  if (error) { showToast('Failed to create event', 'error'); return; }

  document.getElementById('eventTitle').value = '';
  document.getElementById('eventDate').value = '';
  document.getElementById('eventLocation').value = '';
  document.getElementById('eventDesc').value = '';
  closeModal('event-creator-modal');
  showToast('Event created!', 'success');
  switchTab('events');
  await loadEvents();
});

function updateEventsBadge(count) {
  const badge = document.getElementById('events-badge');
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ── Gallery ─────────────────────────────────────── */
async function loadGallery() {
  const { data } = await db.from('posts').select('id, image_url, author, created_at')
    .not('image_url', 'is', null).order('created_at', { ascending: false });
  renderGallery(data || []);
}

function renderGallery(items) {
  const grid  = document.getElementById('gallery-grid');
  const empty = document.getElementById('galleryEmptyState');

  if (items.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  grid.innerHTML = items.map((item, i) => `
    <div class="gallery-item" style="animation-delay:${i * 30}ms" data-lightbox="${escHtml(item.image_url)}">
      <img src="${escHtml(item.image_url)}" alt="Photo" loading="lazy">
      <div class="gallery-item-overlay">
        <span class="gallery-item-author">${escHtml(formatName(item.author).split(' ')[0])}</span>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-lightbox]').forEach(el =>
    el.addEventListener('click', () => openLightbox(el.dataset.lightbox))
  );
}

document.getElementById('gallerySmallBtn').addEventListener('click', () => {
  document.getElementById('gallery-grid').className = 'gallery-grid gallery-3col';
  document.getElementById('gallerySmallBtn').classList.add('active');
  document.getElementById('galleryLargeBtn').classList.remove('active');
});

document.getElementById('galleryLargeBtn').addEventListener('click', () => {
  document.getElementById('gallery-grid').className = 'gallery-grid gallery-2col';
  document.getElementById('galleryLargeBtn').classList.add('active');
  document.getElementById('gallerySmallBtn').classList.remove('active');
});

/* ── Members ─────────────────────────────────────── */
async function loadMembers() {
  const list = document.getElementById('members-list');
  list.innerHTML = '';

  const { data: posts } = await db.from('posts').select('author, created_at');
  if (!posts) return;

  const stats = {};
  posts.forEach(p => {
    if (!stats[p.author]) stats[p.author] = { count: 0, latest: p.created_at };
    stats[p.author].count++;
    if (p.created_at > stats[p.author].latest) stats[p.author].latest = p.created_at;
  });

  const members = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);

  if (members.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons-round empty-icon">group</span><h3>No members yet</h3><p>Start posting to see members!</p></div>';
    return;
  }

  list.innerHTML = members.map(([email, s], i) => `
    <div class="member-card" style="animation-delay:${i * 50}ms">
      <div class="member-avatar" style="background:${getAvatarColor(email)}">${getInitials(email)}</div>
      <div class="member-info">
        <div class="member-name">${escHtml(formatName(email))}</div>
        <div class="member-email">${escHtml(email)}</div>
        <div class="member-stats">${s.count} post${s.count !== 1 ? 's' : ''} · Last active ${formatTime(s.latest)}</div>
      </div>
      ${email === currentUser?.email ? '<span style="font-size:11px;color:var(--gold);font-weight:600;background:var(--gold-dim);border-radius:99px;padding:3px 10px">You</span>' : ''}
    </div>
  `).join('');
}

/* ── Notifications ───────────────────────────────── */
async function loadNotifications() {
  if (!currentUser) return;
  const myEmail = currentUser.email;

  const { data: myPosts } = await db.from('posts').select('id, content').eq('author', myEmail);
  if (!myPosts?.length) return;

  const postIds = myPosts.map(p => p.id);
  const { data: replies } = await db.from('replies').select('*')
    .in('post_id', postIds).neq('author', myEmail).order('created_at', { ascending: false }).limit(15);

  const items = (replies || []);
  const badge = document.getElementById('notifBadge');
  const btn   = document.getElementById('notifBtn');

  if (items.length > 0) {
    badge.classList.remove('hidden');
    badge.textContent = items.length > 9 ? '9+' : items.length;
    btn.classList.remove('hidden');
  }

  const list = document.getElementById('notif-list');
  if (items.length === 0) {
    list.innerHTML = '<div class="notif-empty">No new activity</div>';
    return;
  }

  list.innerHTML = items.map(r => {
    const post = myPosts.find(p => p.id === r.post_id);
    const snippet = post?.content ? `"${post.content.slice(0, 40)}${post.content.length > 40 ? '...' : ''}"` : 'your post';
    return `
      <div class="notif-item" data-post-id="${r.post_id}">
        <div class="notif-avatar" style="background:${getAvatarColor(r.author)}">${getInitials(r.author)}</div>
        <div class="notif-text">
          <div class="notif-msg"><strong>${escHtml(formatName(r.author))}</strong> commented on ${snippet}</div>
          <div class="notif-time">${formatTime(r.created_at)}</div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      closeNotifPanel();
      switchTab('feed');
      setTimeout(() => {
        const card = document.getElementById('post-' + item.dataset.postId);
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 100);
    });
  });
}

function closeNotifPanel() { document.getElementById('notif-panel').classList.add('hidden'); }

/* ── Search ──────────────────────────────────────── */
document.getElementById('searchToggleBtn').addEventListener('click', () => {
  const wrap = document.getElementById('searchBarWrap');
  wrap.classList.toggle('hidden');
  if (!wrap.classList.contains('hidden')) {
    document.getElementById('searchInput').focus();
  } else {
    currentSearch = '';
    document.getElementById('searchInput').value = '';
    if (currentTab === 'feed') renderFeed(allPosts);
  }
});

document.getElementById('searchInput').addEventListener('input', e => {
  currentSearch = e.target.value;
  document.getElementById('searchClear').classList.toggle('hidden', !currentSearch);
  if (currentTab === 'feed') renderFeed(allPosts);
});

document.getElementById('searchClear').addEventListener('click', () => {
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.add('hidden');
  if (currentTab === 'feed') renderFeed(allPosts);
  document.getElementById('searchInput').focus();
});

/* ── Lightbox ────────────────────────────────────── */
function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxBackdrop').addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLightbox(); closeStoryViewer(); closeNotifPanel(); }
});

/* ── Modals ──────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('createPostBtn').addEventListener('click', () => {
  resetPostModal();
  openModal('post-creator-modal');
});
document.getElementById('emptyCreateBtn').addEventListener('click', () => {
  resetPostModal();
  openModal('post-creator-modal');
});
document.getElementById('closePostModal').addEventListener('click', () => {
  resetPostModal();
  closeModal('post-creator-modal');
});

document.getElementById('addStoryBtn').addEventListener('click', () => openModal('story-creator-modal'));
document.getElementById('closeStoryModal').addEventListener('click', () => closeModal('story-creator-modal'));

['post-creator-modal','story-creator-modal','event-creator-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) closeModal(id); });
});

/* ── Notifications ───────────────────────────────── */
document.getElementById('notifBtn').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('hidden');
});
document.getElementById('closeNotifBtn').addEventListener('click', closeNotifPanel);
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target.id !== 'notifBtn') {
    closeNotifPanel();
  }
});

/* ── Realtime ────────────────────────────────────── */
function setupRealtime() {
  realtimeChannel = db.channel('v3-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async () => {
      await loadFeed();
      if (currentTab === 'gallery') await loadGallery();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, async () => {
      await loadStories();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, async () => {
      if (currentTab === 'events') await loadEvents();
    })
    .subscribe();
}
function teardownRealtime() { if (realtimeChannel) db.removeChannel(realtimeChannel); }

/* ── Skeletons ───────────────────────────────────── */
function showSkeletons() {
  document.getElementById('feed').innerHTML = [1,2,3].map(() => `
    <div class="skeleton-card">
      <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
      <div class="skeleton-body"></div>
      <div class="skeleton-image"></div>
    </div>
  `).join('');
}

/* ── UI Helpers ──────────────────────────────────── */
function showApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('notifBtn').classList.remove('hidden');
}
function showAuth() {
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('notifBtn').classList.add('hidden');
}
function setUserChip(email) {
  document.getElementById('userChipAvatar').style.background = getAvatarColor(email);
  document.getElementById('userChipAvatar').textContent = getInitials(email);
  document.getElementById('userChipName').textContent = formatName(email);
}
function setPostModalAuthor(email) {
  document.getElementById('postModalAuthor').innerHTML = `
    <div class="post-avatar" style="background:${getAvatarColor(email)};width:34px;height:34px;font-size:12px">${getInitials(email)}</div>
    <span style="font-size:14px;font-weight:600;color:var(--text-1)">${escHtml(formatName(email))}</span>
  `;
}
function setLoading(id, on) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn._orig = btn.innerHTML; btn.innerHTML = '<span class="material-icons-round" style="animation:spin 0.8s linear infinite">sync</span>'; }
  else { btn.innerHTML = btn._orig || btn.innerHTML; }
}

function bindGlobalUI() {
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  bindStoryAddBtn();
  /* Set default datetime to now */
  const dt = document.getElementById('eventDate');
  if (dt) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dt.value = now.toISOString().slice(0, 16);
  }
}

/* ── Toast ───────────────────────────────────────── */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: 'check_circle', error: 'error_outline', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="material-icons-round">${icons[type]}</span>${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s ease forwards';
    setTimeout(() => toast.remove(), 260);
  }, 3000);
}

/* ── Utilities ───────────────────────────────────── */
function getInitials(email) {
  if (!email) return '?';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const COLORS = ['#f6ad55','#68d391','#63b3ed','#fc8181','#b794f4','#f687b3','#4fd1c5','#fbd38d','#9ae6b4','#90cdf4'];
function getAvatarColor(email) {
  if (!email) return COLORS[0];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function formatName(email) {
  if (!email) return 'Unknown';
  return email.split('@')[0].split(/[._-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
