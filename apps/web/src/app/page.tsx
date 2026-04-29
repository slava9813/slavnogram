"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  CircleUserRound,
  Heart,
  Home as HomeIcon,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  Palette,
  Phone,
  PhoneOff,
  Plus,
  Radio,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  Trash2,
} from "lucide-react";
import { apiBase, assetUrl, ChatGroup, Community, GroupMessage, Message, Post, request, User } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { AvatarEditor } from "@/components/AvatarEditor";

type AuthResponse = { token: string; user: User };
type Tab = "feed" | "people" | "chat" | "communities" | "profile" | "saved" | "settings";
type AuthPayload = { username: string; displayName: string; password: string; avatarImage?: string };
type CallRoom = { id: string; title: string; muted: boolean };
type RemoteAudioStream = { userId: number; stream: MediaStream };
type CallSignalPayload =
  | { type: "offer"; targetUserId: number; description: RTCSessionDescriptionInit }
  | { type: "answer"; targetUserId: number; description: RTCSessionDescriptionInit }
  | { type: "ice"; targetUserId: number; candidate: RTCIceCandidateInit };

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [showAuth, setShowAuth] = useState(false);
  const [tab, setTab] = useState<Tab>("feed");
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [activeGroup, setActiveGroup] = useState<ChatGroup | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [callRoom, setCallRoom] = useState<CallRoom | null>(null);
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const activeChatRef = useRef<User | null>(null);
  const activeGroupRef = useRef<ChatGroup | null>(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  useEffect(() => {
    const saved = localStorage.getItem("slavnogram_token");
    if (!saved) {
      refreshAll(null).catch(showError);
      return;
    }

    setToken(saved);
    request<User>("/auth/me", {}, saved)
      .then((user) => {
        setMe(user);
        setProfileUser(user);
        return refreshAll(saved);
      })
      .catch((error) => {
        localStorage.removeItem("slavnogram_token");
        setToken(null);
        setMe(null);
        showError(error);
        return refreshAll(null);
      });
  }, []);

  useEffect(() => {
    if (!token || !me) return;

    refreshAll(token).catch(showError);
    const socket = io(apiBase(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on("presence:update", (ids: number[]) => setOnlineIds(ids));
    socket.on("chat:message", (message: Message) => {
      setMessages((current) => {
        const chat = activeChatRef.current;
        if (!chat || ![message.senderId, message.recipientId].includes(chat.id)) return current;
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message];
      });
    });
    socket.on("chat:group-message", (message: GroupMessage) => {
      setGroupMessages((current) => {
        const group = activeGroupRef.current;
        if (!group || group.id !== message.groupId) return current;
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message];
      });
    });
    socket.on("chat:group-updated", (group: ChatGroup) => {
      setGroups((current) => [group, ...current.filter((item) => item.id !== group.id)]);
    });
    socket.on("call:user-joined", (event: { roomId: string; user?: User; label?: string }) => {
      setNotice(`${event.user?.displayName || "Участник"} подключился к звонку`);
      setTimeout(() => setNotice(""), 2600);
    });
    socket.on("call:incoming", (event: { roomId: string; user?: User; label?: string }) => {
      setNotice(`${event.user?.displayName || "Кто-то"} зовёт в звонок: ${event.label || "Славнограм"}`);
      setTimeout(() => setNotice(""), 4200);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, me]);

  useEffect(() => {
    if (!token || !activeChat) {
      setMessages([]);
      return;
    }
    request<Message[]>(`/chat/${activeChat.id}/history`, {}, token).then(setMessages).catch(showError);
  }, [token, activeChat]);

  useEffect(() => {
    if (!token || !activeGroup) {
      setGroupMessages([]);
      return;
    }
    request<GroupMessage[]>(`/chat/groups/${activeGroup.id}/history`, {}, token).then(setGroupMessages).catch(showError);
  }, [token, activeGroup]);

  const authed = Boolean(token && me);
  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = users.map((user) => ({ ...user, online: onlineIds.includes(user.id) || user.online }));
    if (!needle) return list;
    return list.filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(needle));
  }, [users, query, onlineIds]);
  const onlineFriends = visibleUsers.filter((user) => onlineIds.includes(user.id) || user.online).slice(0, 5);
  const profilePosts = posts.filter((post) => post.author.id === (profileUser?.id ?? me?.id));

  async function refreshAll(authToken = token) {
    const [newPosts, newUsers, newCommunities] = await Promise.all([
      request<Post[]>("/posts", {}, authToken),
      request<User[]>("/users", {}, authToken),
      request<Community[]>("/communities", {}, authToken),
    ]);
    const newFriends = authToken ? await request<User[]>("/friends", {}, authToken).catch(() => []) : [];
    const newGroups = authToken ? await request<ChatGroup[]>("/chat/groups/list", {}, authToken).catch(() => []) : [];
    const newSaved = authToken ? await request<Post[]>("/posts/saved", {}, authToken).catch(() => []) : [];
    setPosts(newPosts);
    setUsers(newUsers);
    setFriends(newFriends);
    setGroups(newGroups);
    setSavedPosts(newSaved);
    setCommunities(newCommunities);
  }

  function showError(error: unknown) {
    setNotice(error instanceof Error ? error.message : "Что-то пошло не так");
    setTimeout(() => setNotice(""), 3200);
  }

  function requireAuth() {
    setMode("login");
    setShowAuth(true);
    setNotice("Нужно войти или зарегистрироваться");
    setTimeout(() => setNotice(""), 3200);
    return false;
  }

  function openProfile(user: User | null) {
    if (!user) return;
    setProfileUser(user);
    setTab("profile");
  }

  async function authSubmit(payload: AuthPayload) {
    try {
      const data = await request<AuthResponse>(mode === "register" ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      localStorage.setItem("slavnogram_token", data.token);
      setToken(data.token);
      setMe(data.user);
      setProfileUser(data.user);
      setShowAuth(false);
      setNotice("Готово, ты в Славнограме");
      await refreshAll(data.token);
    } catch (error) {
      showError(error);
    }
  }

  function logout() {
    localStorage.removeItem("slavnogram_token");
    socketRef.current?.disconnect();
    setToken(null);
    setMe(null);
    setFriends([]);
    setMessages([]);
    refreshAll(null).catch(showError);
  }

  return (
    <main className="social-shell">
      <header className="social-topbar">
        <button className="logo-word" onClick={() => setTab("feed")}>
          <span>С</span>лавнограм
        </button>
        <label className="search-pill">
          <Search size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по Славнограму" />
        </label>
        <div className="topbar-spacer" />
        {authed ? (
          <button className="account-pill" onClick={() => openProfile(me)}>
            <Avatar user={me} size="sm" />
            <span>{me!.displayName}</span>
            <ChevronDown size={16} />
          </button>
        ) : (
          <button className="primary-button" onClick={() => setShowAuth(true)}>
            <LogIn size={18} />
            Войти
          </button>
        )}
      </header>

      <aside className="left-rail">
        <section className="left-profile">
          <button className="gear-button" title="Настройки" onClick={() => (authed ? setTab("settings") : requireAuth())}>
            <Settings size={18} />
          </button>
          <Avatar user={me} size="lg" glow onClick={() => (me ? openProfile(me) : setShowAuth(true))} />
          <strong>{me?.displayName || "Гость"}</strong>
          <span>{me ? `@${me.username}` : "смотри ленту без регистрации"}</span>
        </section>
        <nav className="side-nav">
          <SideButton active={tab === "feed"} icon={<HomeIcon />} label="Главная" onClick={() => setTab("feed")} />
          <SideButton active={tab === "people"} icon={<Users />} label="Друзья" onClick={() => setTab("people")} />
          <SideButton active={tab === "chat"} icon={<MessageCircle />} label="Сообщения" badge={messages.length || undefined} onClick={() => setTab("chat")} />
          <SideButton active={tab === "communities"} icon={<Radio />} label="Сообщества" onClick={() => setTab("communities")} />
          <SideButton active={tab === "profile"} icon={<CircleUserRound />} label="Моя страница" onClick={() => (me ? openProfile(me) : requireAuth())} />
          <SideButton active={tab === "saved"} icon={<Bookmark />} label="Сохранённое" onClick={() => (authed ? setTab("saved") : requireAuth())} />
          <SideButton active={tab === "settings"} icon={<Settings />} label="Настройки" onClick={() => (authed ? setTab("settings") : requireAuth())} />
        </nav>
        <button className="ghost-button rail-logout" onClick={authed ? logout : () => setShowAuth(true)}>
          {authed ? <LogOut size={18} /> : <LogIn size={18} />}
          {authed ? "Выйти" : "Войти"}
        </button>
      </aside>

      <section className="main-stage">
        <div key={tab} className="view-stage">
          {tab === "feed" && (
            <Feed posts={posts} communities={communities} token={token} me={me} onAuth={requireAuth} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />
          )}
          {tab === "people" && (
            <People users={visibleUsers} friends={friends} onlineIds={onlineIds} token={token} onAuth={requireAuth} onProfile={openProfile} onChat={(user) => { setActiveChat(user); setTab("chat"); }} onChange={() => refreshAll().catch(showError)} onError={showError} />
          )}
          {tab === "chat" && (
            <Messenger
              me={me}
              contacts={friends.length ? friends : visibleUsers}
              groups={groups}
              active={activeChat}
              activeGroup={activeGroup}
              setActive={(user) => {
                setActiveChat(user);
                setActiveGroup(null);
              }}
              setActiveGroup={(group) => {
                setActiveGroup(group);
                setActiveChat(null);
              }}
              messages={messages}
              groupMessages={groupMessages}
              socket={socketRef.current}
              callRoom={callRoom}
              setCallRoom={setCallRoom}
              token={token}
              onAuth={requireAuth}
              onProfile={openProfile}
              onRefresh={() => refreshAll().catch(showError)}
              onError={showError}
            />
          )}
          {tab === "communities" && <Communities communities={communities} token={token} onAuth={requireAuth} onChange={() => refreshAll().catch(showError)} onError={showError} />}
          {tab === "profile" && (
            <ProfilePage user={profileUser || me} me={me} posts={profilePosts} token={token} isFriend={Boolean(profileUser && friends.some((friend) => friend.id === profileUser.id))} onAuth={requireAuth} onChat={(user) => { setActiveChat(user); setActiveGroup(null); setTab("chat"); }} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />
          )}
          {tab === "saved" && <SavedView posts={savedPosts} token={token} onAuth={requireAuth} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />}
          {tab === "settings" && <SettingsView me={me} token={token} onAuth={requireAuth} onMe={setMe} onChange={() => refreshAll().catch(showError)} onError={showError} />}
        </div>
      </section>

      <aside className="right-rail">
        <Widget title="Онлайн друзья" action="Все">
          <div className="mini-list">
            {(onlineFriends.length ? onlineFriends : visibleUsers.slice(0, 5)).map((user) => (
              <button className="mini-person" key={user.id} onClick={() => openProfile(user)}>
                <Avatar user={user} size="sm" />
                <span>
                  <strong>{user.displayName}</strong>
                  <small className={onlineIds.includes(user.id) || user.online ? "online" : ""}>{onlineIds.includes(user.id) || user.online ? "Онлайн" : "В сети недавно"}</small>
                </span>
                <i />
              </button>
            ))}
          </div>
        </Widget>
        <Widget title="Сообщения" action="Все">
          <div className="mini-list">
            {(friends.length ? friends : visibleUsers).slice(0, 4).map((user, index) => (
              <button className="mini-person" key={user.id} onClick={() => { setActiveChat(user); setTab("chat"); }}>
                <Avatar user={user} size="sm" />
                <span>
                  <strong>{user.displayName}</strong>
                  <small>{index % 2 ? "Давай сегодня?" : "Привет, как дела?"}</small>
                </span>
              </button>
            ))}
          </div>
        </Widget>
        <Widget title="Популярные сообщества" action="Все">
          <div className="community-mini">
            {communities.slice(0, 4).map((community) => (
              <div key={community.id}>
                <span className="community-icon">{community.name.slice(0, 1).toUpperCase()}</span>
                <strong>{community.name}</strong>
                <small>{community.membersCount} участников</small>
              </div>
            ))}
          </div>
        </Widget>
      </aside>

      {showAuth && <AuthDialog mode={mode} setMode={setMode} onSubmit={authSubmit} onClose={() => setShowAuth(false)} />}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function SideButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button className={active ? "side-button active" : "side-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge ? <b>{badge}</b> : null}
    </button>
  );
}

function Widget({ title, action, children }: { title: string; action: string; children: React.ReactNode }) {
  return (
    <section className="widget-card">
      <header>
        <h3>{title}</h3>
        <button>{action}</button>
      </header>
      {children}
    </section>
  );
}

function AuthDialog({
  mode,
  setMode,
  onSubmit,
  onClose,
}: {
  mode: "login" | "register";
  setMode: (mode: "login" | "register") => void;
  onSubmit: (payload: AuthPayload) => void;
  onClose: () => void;
}) {
  const [avatarImage, setAvatarImage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      username: String(form.get("username") || ""),
      displayName: String(form.get("displayName") || ""),
      password: String(form.get("password") || ""),
      avatarImage: mode === "register" ? avatarImage : undefined,
    });
  }

  return (
    <div className="auth-overlay">
      <section className="auth-panel auth-dialog">
        <button className="icon-button auth-close" title="Закрыть" onClick={onClose}>
          ×
        </button>
        <div className="brand-mark">
          <Sparkles size={26} />
        </div>
        <h1>Славнограм</h1>
        <p className="muted">{mode === "register" ? "Нарисуй аватар сейчас. После регистрации изменить его нельзя." : "Войди, чтобы писать, лайкать и общаться."}</p>
        <form onSubmit={submit} className="auth-form">
          <input name="username" placeholder="логин" autoComplete="username" />
          {mode === "register" && <input name="displayName" placeholder="имя на сайте" autoComplete="name" />}
          <input name="password" placeholder="пароль" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {mode === "register" && <AvatarEditor value={avatarImage} onChange={setAvatarImage} />}
          <button type="submit" className="primary-button">
            <CircleUserRound size={18} />
            {mode === "register" ? "Создать аккаунт" : "Войти"}
          </button>
        </form>
        <button className="ghost-button wide" onClick={() => setMode(mode === "register" ? "login" : "register")}>
          {mode === "register" ? "Уже есть аккаунт" : "Нужна регистрация"}
        </button>
      </section>
    </div>
  );
}

function AuthRequired({ title, onAuth }: { title: string; onAuth: () => void }) {
  return (
    <section className="auth-required">
      <Sparkles size={28} />
      <h3>{title}</h3>
      <p>Смотреть можно без аккаунта, но это действие требует вход.</p>
      <button className="primary-button" onClick={onAuth}>
        <LogIn size={18} />
        Войти или зарегистрироваться
      </button>
    </section>
  );
}

function Feed({
  posts,
  communities,
  token,
  me,
  onAuth,
  onProfile,
  onChange,
  onError,
}: {
  posts: Post[];
  communities: Community[];
  token: string | null;
  me: User | null;
  onAuth: () => boolean;
  onProfile: (user: User) => void;
  onChange: () => void;
  onError: (error: unknown) => void;
}) {
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const form = new FormData(event.currentTarget);
    try {
      await request<Post>("/posts", { method: "POST", body: form }, token);
      event.currentTarget.reset();
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="feed-stack">
      {token ? (
        <form className="compose-card" onSubmit={create}>
          <Avatar user={me} size="md" />
          <div>
            <strong>Создать пост</strong>
            <textarea name="text" placeholder={`Что у тебя нового${me ? `, ${me.displayName}` : ""}?`} />
            <div className="compose-actions">
              <label title="Фото">
                <ImageIcon size={20} />
                <input name="photo" type="file" accept="image/*" />
              </label>
              <select name="communityId" defaultValue="">
                <option value="">Личный пост</option>
                {communities.map((community) => (
                  <option key={community.id} value={community.id}>{community.name}</option>
                ))}
              </select>
              <button className="primary-button">Опубликовать</button>
            </div>
          </div>
        </form>
      ) : (
        <AuthRequired title="Публикация доступна после входа" onAuth={() => void onAuth()} />
      )}

      <section className="content-card rec-card">
        <header>
          <h3>Рекомендации для вас</h3>
          <SlidersHorizontal size={20} />
        </header>
      </section>

      {posts.map((post) => (
        <PostCard key={post.id} post={post} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />
      ))}
    </div>
  );
}

function PostCard({ post, token, onAuth, onProfile, onChange, onError }: { post: Post; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChange: () => void; onError: (error: unknown) => void }) {
  async function like() {
    if (!token) return void onAuth();
    try {
      await request(`/posts/${post.id}/like`, { method: "POST" }, token);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ text: form.get("text") }) }, token);
      event.currentTarget.reset();
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  async function save() {
    if (!token) return void onAuth();
    try {
      await request(`/posts/${post.id}/save`, { method: "POST" }, token);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <article className="post-card">
      <header className="post-head">
        <Avatar user={post.author} size="md" onClick={() => onProfile(post.author)} />
        <button onClick={() => onProfile(post.author)}>
          <strong>{post.author.displayName}</strong>
          <span>@{post.author.username}{post.communityName ? ` • ${post.communityName}` : ""}</span>
        </button>
        <MoreHorizontal size={20} />
      </header>
      {post.text && <p className="post-text">{post.text}</p>}
      {post.photoUrl && <img className="post-photo" alt="" src={assetUrl(post.photoUrl)} />}
      <div className="post-actions">
        <button className={post.likedByMe ? "liked" : ""} onClick={like}><Heart size={20} />{post.likesCount}</button>
        <button onClick={() => !token && onAuth()}><MessageCircle size={20} />{post.comments.length}</button>
        <button onClick={() => !token && onAuth()}><Share2 size={20} /></button>
        <button className="save-action" onClick={save}><Bookmark size={20} /></button>
      </div>
      <div className="comments">
        {post.comments.slice(-3).map((item) => (
          <div key={item.id} className="comment">
            <strong>{item.author.displayName}</strong>
            <span>{item.text}</span>
          </div>
        ))}
        <form onSubmit={comment}>
          <input name="text" placeholder={token ? "Комментарий" : "Войдите, чтобы комментировать"} />
          <button title="Отправить"><Send size={16} /></button>
        </form>
      </div>
    </article>
  );
}

function People({ users, friends, onlineIds, token, onAuth, onProfile, onChat, onChange, onError }: { users: User[]; friends: User[]; onlineIds: number[]; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChat: (user: User) => void; onChange: () => void; onError: (error: unknown) => void }) {
  const friendIds = new Set(friends.map((user) => user.id));

  async function add(user: User) {
    if (!token) return void onAuth();
    try {
      await request(`/friends/${user.id}`, { method: "POST" }, token);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="people-grid">
      {users.map((user) => {
        const isFriend = friendIds.has(user.id);
        const online = onlineIds.includes(user.id) || user.online;
        return (
          <article className="person-card" key={user.id}>
            <Avatar user={user} size="lg" glow onClick={() => onProfile(user)} />
            <strong>{user.displayName}</strong>
            <span className={online ? "online" : ""}>{online ? "онлайн" : `@${user.username}`}</span>
            <div>
              <button className="ghost-button" onClick={() => onProfile(user)}>Страница</button>
              <button className="primary-button" onClick={() => (isFriend ? onChat(user) : add(user))}>{isFriend ? "Написать" : "Добавить"}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Messenger({
  me,
  contacts,
  groups,
  active,
  activeGroup,
  setActive,
  setActiveGroup,
  messages,
  groupMessages,
  socket,
  callRoom,
  setCallRoom,
  token,
  onAuth,
  onProfile,
  onRefresh,
  onError,
}: {
  me: User | null;
  contacts: User[];
  groups: ChatGroup[];
  active: User | null;
  activeGroup: ChatGroup | null;
  setActive: (user: User) => void;
  setActiveGroup: (group: ChatGroup) => void;
  messages: Message[];
  groupMessages: GroupMessage[];
  socket: Socket | null;
  callRoom: CallRoom | null;
  setCallRoom: (room: CallRoom | null | ((current: CallRoom | null) => CallRoom | null)) => void;
  token: string | null;
  onAuth: () => boolean;
  onProfile: (user: User) => void;
  onRefresh: () => void;
  onError: (error: unknown) => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteAudioStream[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const callRoomRef = useRef<CallRoom | null>(callRoom);

  useEffect(() => {
    callRoomRef.current = callRoom;
  }, [callRoom]);

  useEffect(() => {
    if (!socket || !me) return;
    const self = me;
    const activeSocket = socket;

    async function handleUserJoined(event: { roomId: string; user?: User }) {
      const room = callRoomRef.current;
      if (!room || room.id !== event.roomId || !event.user || event.user.id === self.id) return;
      try {
        const peer = await ensurePeer(event.user.id, event.roomId);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        activeSocket.emit("call:signal", {
          roomId: event.roomId,
          payload: { type: "offer", targetUserId: event.user.id, description: peer.localDescription },
        });
      } catch (error) {
        onError(error);
      }
    }

    async function handleSignal(event: { roomId: string; fromUserId: number; payload?: CallSignalPayload }) {
      const room = callRoomRef.current;
      const payload = event.payload;
      if (!room || room.id !== event.roomId || !payload || payload.targetUserId !== self.id || event.fromUserId === self.id) return;

      try {
        const peer = await ensurePeer(event.fromUserId, event.roomId);
        if (payload.type === "offer") {
          await peer.setRemoteDescription(payload.description);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          activeSocket.emit("call:signal", {
            roomId: event.roomId,
            payload: { type: "answer", targetUserId: event.fromUserId, description: peer.localDescription },
          });
        }
        if (payload.type === "answer") {
          await peer.setRemoteDescription(payload.description);
        }
        if (payload.type === "ice") {
          await peer.addIceCandidate(payload.candidate);
        }
      } catch (error) {
        onError(error);
      }
    }

    function handleUserLeft(event: { roomId: string; userId: number }) {
      if (callRoomRef.current?.id !== event.roomId) return;
      closePeer(event.userId);
    }

    activeSocket.on("call:user-joined", handleUserJoined);
    activeSocket.on("call:signal", handleSignal);
    activeSocket.on("call:user-left", handleUserLeft);
    return () => {
      activeSocket.off("call:user-joined", handleUserJoined);
      activeSocket.off("call:signal", handleSignal);
      activeSocket.off("call:user-left", handleUserLeft);
    };
  }, [socket, me, onError]);

  useEffect(() => {
    return () => endLocalCall(false);
  }, []);

  async function ensureLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  }

  async function ensurePeer(userId: number, roomId: string) {
    const existing = peersRef.current.get(userId);
    if (existing) return existing;

    const stream = await ensureLocalStream();
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    for (const track of stream.getTracks()) {
      peer.addTrack(track, stream);
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate || !socket) return;
      socket.emit("call:signal", {
        roomId,
        payload: { type: "ice", targetUserId: userId, candidate: event.candidate.toJSON() },
      });
    };
    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      setRemoteStreams((current) => {
        const next = current.filter((item) => item.userId !== userId);
        return [...next, { userId, stream: remoteStream }];
      });
    };
    peer.onconnectionstatechange = () => {
      if (["closed", "disconnected", "failed"].includes(peer.connectionState)) closePeer(userId);
    };

    peersRef.current.set(userId, peer);
    return peer;
  }

  function closePeer(userId: number) {
    peersRef.current.get(userId)?.close();
    peersRef.current.delete(userId);
    setRemoteStreams((current) => current.filter((item) => item.userId !== userId));
  }

  function endLocalCall(emitLeave = true) {
    const room = callRoomRef.current;
    if (emitLeave && room && socket) socket.emit("call:leave", { roomId: room.id });
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setRemoteStreams([]);
    setCallRoom(null);
  }

  function toggleMute() {
    setCallRoom((room) => {
      if (!room) return room;
      const muted = !room.muted;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      return { ...room, muted };
    });
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !socket) return void onAuth();
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content") || "").trim();
    if (!content) return;
    if (activeGroup) {
      socket.emit("chat:group-send", { groupId: activeGroup.id, content });
    } else if (active) {
      socket.emit("chat:send", { toUserId: active.id, content });
    }
    event.currentTarget.reset();
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    try {
      const group = await request<ChatGroup>("/chat/groups", { method: "POST", body: JSON.stringify({ name: groupName, memberIds: selectedMembers }) }, token);
      setGroupName("");
      setSelectedMembers([]);
      setActiveGroup(group);
      onRefresh();
    } catch (error) {
      onError(error);
    }
  }

  async function startCall() {
    if (!me || !socket) return void onAuth();
    const title = activeGroup?.name || active?.displayName;
    if (!title) return;
    try {
      await ensureLocalStream();
    } catch {
      onError(new Error("Браузер не дал доступ к микрофону"));
      return;
    }
    const roomId = activeGroup ? `group-${activeGroup.id}` : `direct-${[me.id, active!.id].sort((a, b) => a - b).join("-")}`;
    socket.emit("call:join", { roomId, label: title });
    setCallRoom({ id: roomId, title, muted: false });
  }

  function leaveCall() {
    endLocalCall();
  }

  const currentTitle = activeGroup?.name || active?.displayName || "Выбери диалог";
  const currentSubtitle = activeGroup ? `${activeGroup.members.length} участников` : active ? `@${active.username}` : "Личные и групповые чаты";
  const currentMessages = activeGroup ? groupMessages : messages;

  return (
    <section className="messenger-shell">
      <aside className="messenger-contacts">
        <header>
          <h3>Сообщения</h3>
          <button onClick={() => !me && onAuth()}><Plus size={18} /></button>
        </header>
        {me && (
          <form className="group-maker" onSubmit={createGroup}>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Новая группа" />
            <div>
              {contacts.slice(0, 6).map((user) => (
                <label key={user.id}>
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(user.id)}
                    onChange={(event) => setSelectedMembers((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))}
                  />
                  {user.displayName}
                </label>
              ))}
            </div>
            <button className="ghost-button"><Users size={16} />Создать</button>
          </form>
        )}
        {groups.map((group) => (
          <button className={activeGroup?.id === group.id ? "contact-row active" : "contact-row"} key={`g-${group.id}`} onClick={() => setActiveGroup(group)}>
            <span className="group-avatar"><Users size={18} /></span>
            <span>
              <strong>{group.name}</strong>
              <small>{group.members.length} участников</small>
            </span>
          </button>
        ))}
        {contacts.map((user) => (
          <button className={active?.id === user.id ? "contact-row active" : "contact-row"} key={user.id} onClick={() => setActive(user)}>
            <Avatar user={user} size="sm" />
            <span>
              <strong>{user.displayName}</strong>
              <small>{me ? "Нажми, чтобы открыть чат" : "Вход нужен для переписки"}</small>
            </span>
          </button>
        ))}
      </aside>
      <section className="conversation-card">
        {active || activeGroup ? (
          <>
            <header className="conversation-head">
              {active ? <Avatar user={active} size="md" onClick={() => onProfile(active)} /> : <span className="group-avatar big"><Users size={24} /></span>}
              <button onClick={() => active && onProfile(active)}>
                <strong>{currentTitle}</strong>
                <span>{currentSubtitle}</span>
              </button>
              <button className="call-button" onClick={startCall}><Phone size={18} />Звонок</button>
            </header>
            {callRoom && (
              <div className="call-banner">
                <span><Phone size={18} />Звонок: {callRoom.title} · {remoteStreams.length ? `${remoteStreams.length + 1} в эфире` : "ждём собеседника"}</span>
                {remoteStreams.map((item) => <RemoteAudio key={item.userId} stream={item.stream} />)}
                <button onClick={toggleMute}>{callRoom.muted ? <MicOff size={17} /> : <Mic size={17} />}</button>
                <button onClick={leaveCall}><PhoneOff size={17} />Завершить</button>
              </div>
            )}
            <div className="message-stream">
              {!me && <AuthRequired title="Сообщения доступны после входа" onAuth={() => void onAuth()} />}
              {currentMessages.map((message) => (
                <div className={message.senderId === me?.id ? "message-bubble mine" : "message-bubble"} key={message.id}>
                  {activeGroup && <small>{message.sender?.displayName}</small>}
                  {message.content}
                </div>
              ))}
            </div>
            <form className="message-form" onSubmit={send}>
              <button type="button" title="Фото" onClick={() => !me && onAuth()}><Camera size={19} /></button>
              <input name="content" placeholder={me ? "Напиши сообщение" : "Войдите, чтобы написать"} />
              <button className="primary-button"><Send size={18} /></button>
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <MessageCircle size={42} />
            <h3>Выбери диалог</h3>
            <p>Личные и групповые сообщения открыты здесь. Звонки используют микрофон браузера и WebSocket-сигналинг.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline />;
}

function SavedView({ posts, token, onAuth, onProfile, onChange, onError }: { posts: Post[]; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChange: () => void; onError: (error: unknown) => void }) {
  if (!token) return <AuthRequired title="Сохранённое доступно после входа" onAuth={() => void onAuth()} />;
  return (
    <div className="feed-stack narrow-stack">
      <section className="content-card rec-card">
        <header>
          <h3>Сохранённые посты</h3>
          <Bookmark size={20} />
        </header>
      </section>
      {posts.length ? posts.map((post) => (
        <PostCard key={post.id} post={post} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />
      )) : <AuthRequired title="Пока ничего не сохранено" onAuth={() => undefined} />}
    </div>
  );
}

function SettingsView({ me, token, onAuth, onMe, onChange, onError }: { me: User | null; token: string | null; onAuth: () => boolean; onMe: (user: User) => void; onChange: () => void; onError: (error: unknown) => void }) {
  const [displayName, setDisplayName] = useState(me?.displayName || "");
  const [bio, setBio] = useState(me?.bio || "");
  const [accent, setAccent] = useState(String(me?.pageConfig?.accent || "#a86bff"));
  const [status, setStatus] = useState(String(me?.pageConfig?.status || ""));
  const [compactFeed, setCompactFeed] = useState(Boolean(me?.settings?.compactFeed));
  const [reduceMotion, setReduceMotion] = useState(Boolean(me?.settings?.reduceMotion));
  const [privateProfile, setPrivateProfile] = useState(Boolean(me?.settings?.privateProfile));
  const [messageRequests, setMessageRequests] = useState(String(me?.settings?.messageRequests || "everyone"));
  const [callQuality, setCallQuality] = useState(String(me?.settings?.callQuality || "balanced"));
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (!token || !me) return <AuthRequired title="Настройки доступны после входа" onAuth={() => void onAuth()} />;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const user = await request<User>(
        "/users/me/profile",
        { method: "PATCH", body: JSON.stringify({ displayName, bio, pageConfig: { accent, status, cover: "aurora" } }) },
        token,
      );
      onMe(user);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const user = await request<User>(
        "/users/me/settings",
        { method: "PATCH", body: JSON.stringify({ compactFeed, reduceMotion, privateProfile, messageRequests, callQuality, autoModeration: true }) },
        token,
      );
      onMe(user);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  async function deleteAccount() {
    try {
      await request("/users/me", { method: "DELETE", body: JSON.stringify({ confirm: deleteConfirm }) }, token);
      localStorage.removeItem("slavnogram_token");
      location.reload();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="settings-grid">
      <form className="settings-card" onSubmit={saveProfile}>
        <h3><Palette size={20} />Страница</h3>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Имя" />
        <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Описание страницы" />
        <label>Акцент профиля<input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></label>
        <input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="Статус" />
        <button className="primary-button"><Save size={18} />Сохранить страницу</button>
      </form>

      <form className="settings-card" onSubmit={saveSettings}>
        <h3><Settings size={20} />Гибкие настройки</h3>
        <label><input type="checkbox" checked={compactFeed} onChange={(event) => setCompactFeed(event.target.checked)} />Компактная лента</label>
        <label><input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} />Уменьшить анимации</label>
        <label><input type="checkbox" checked={privateProfile} onChange={(event) => setPrivateProfile(event.target.checked)} />Приватный профиль</label>
        <label>Кто может писать
          <select value={messageRequests} onChange={(event) => setMessageRequests(event.target.value)}>
            <option value="everyone">Все</option>
            <option value="friends">Только друзья</option>
          </select>
        </label>
        <label>Качество звонков
          <select value={callQuality} onChange={(event) => setCallQuality(event.target.value)}>
            <option value="balanced">Баланс</option>
            <option value="high">Высокое</option>
          </select>
        </label>
        <button className="primary-button"><ShieldCheck size={18} />Сохранить настройки</button>
      </form>

      <section className="settings-card danger-card">
        <h3><Trash2 size={20} />Удалить аккаунт</h3>
        <p>Это удалит профиль, посты, сообщения, друзей и сообщества. Для подтверждения введи УДАЛИТЬ.</p>
        <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder="УДАЛИТЬ" />
        <button className="ghost-button" onClick={deleteAccount}><Trash2 size={18} />Удалить аккаунт</button>
      </section>
    </div>
  );
}

function Communities({ communities, token, onAuth, onChange, onError }: { communities: Community[]; token: string | null; onAuth: () => boolean; onChange: () => void; onError: (error: unknown) => void }) {
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const form = new FormData(event.currentTarget);
    try {
      await request("/communities", { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description") }) }, token);
      event.currentTarget.reset();
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  async function subscribe(id: number) {
    if (!token) return void onAuth();
    await request(`/communities/${id}/subscribe`, { method: "POST" }, token);
    onChange();
  }

  return (
    <div className="communities-layout">
      {token ? (
        <form className="compose-card community-compose" onSubmit={create}>
          <Radio size={34} />
          <div>
            <strong>Создать сообщество</strong>
            <input name="name" placeholder="Название" />
            <textarea name="description" placeholder="Описание" />
            <button className="primary-button">Создать</button>
          </div>
        </form>
      ) : (
        <AuthRequired title="Создание сообществ доступно после входа" onAuth={() => void onAuth()} />
      )}
      <div className="community-list">
        {communities.map((community) => (
          <article className="community-card" key={community.id}>
            <span className="community-icon">{community.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h3>{community.name}</h3>
              <p>{community.description || "Без описания"}</p>
              <small>{community.membersCount} участников</small>
            </div>
            <button className={community.joinedByMe ? "primary-button joined" : "primary-button"} onClick={() => subscribe(community.id)}>
              <Check size={18} />
              {community.joinedByMe ? "Внутри" : "Подписаться"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProfilePage({ user, me, posts, token, isFriend, onAuth, onChat, onProfile, onChange, onError }: { user: User | null; me: User | null; posts: Post[]; token: string | null; isFriend: boolean; onAuth: () => boolean; onChat: (user: User) => void; onProfile: (user: User) => void; onChange: () => void; onError: (error: unknown) => void }) {
  if (!user) return <AuthRequired title="Личная страница доступна после выбора пользователя" onAuth={() => void onAuth()} />;

  async function add() {
    if (!token) return void onAuth();
    try {
      await request(`/friends/${user!.id}`, { method: "POST" }, token);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  const mine = me?.id === user.id;

  return (
    <section className="profile-page">
      <div className="profile-hero">
        <div className="profile-cover" />
        <Avatar user={user} size="lg" glow />
        <div>
          <h2>{user.displayName}</h2>
          <span>@{user.username}</span>
          <p>Личная страница Славнограма. Аватар нарисован при регистрации и закреплён навсегда.</p>
        </div>
        <div className="profile-actions">
          {!mine && <button className="primary-button" onClick={() => (isFriend ? onChat(user) : add())}>{isFriend ? "Написать" : "Добавить"}</button>}
          {mine && <button className="ghost-button" onClick={() => onAuth()}>Аватар locked</button>}
        </div>
      </div>
      <div className="profile-stats">
        <span><strong>{posts.length}</strong> постов</span>
        <span><strong>{user.avatarLocked ? "1" : "0"}</strong> аватар</span>
        <span><strong>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</strong> с нами</span>
      </div>
      <div className="feed-stack">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />
        ))}
      </div>
    </section>
  );
}
