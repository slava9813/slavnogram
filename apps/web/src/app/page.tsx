"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  CircleUserRound,
  Heart,
  Headphones,
  Home as HomeIcon,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Paperclip,
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
  Smile,
  Sparkles,
  Square,
  UserPlus,
  Users,
  Trash2,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AdminUser, apiBase, AppNotification, assetUrl, ChatGroup, Community, GroupMessage, Message, Post, request, User } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { AvatarEditor } from "@/components/AvatarEditor";

type AuthResponse = { token: string; user: User };
type Tab = "feed" | "people" | "chat" | "communities" | "community" | "profile" | "saved" | "settings" | "admin";
type AuthPayload = { username: string; displayName: string; password: string; avatarImage?: string };
type CallRoom = { id: string; title: string; muted: boolean };
type RemoteAudioStream = { userId: number; stream: MediaStream };
type CallParticipant = { user: User; stream?: MediaStream; local?: boolean };
type IncomingCall = { roomId: string; user?: User; label?: string };
type PendingCall = { roomId: string; title: string; participants: User[] };
type RichMessage =
  | { type: "text"; text: string }
  | { type: "file"; url: string; name: string; mime: string; size?: number }
  | { type: "voice"; url: string; name: string; mime: string; size?: number };
type CallSignalPayload =
  | { type: "offer"; targetUserId: number; description: RTCSessionDescriptionInit }
  | { type: "answer"; targetUserId: number; description: RTCSessionDescriptionInit }
  | { type: "ice"; targetUserId: number; candidate: RTCIceCandidateInit };

const topicOptions = ["игры", "музыка", "мемы", "технологии", "спорт", "кино", "арт", "учёба", "новости", "общение"];

function playUiSound(path: string, volume = 0.72) {
  if (typeof window === "undefined") return;
  const audio = new Audio(path);
  audio.volume = Math.max(0, Math.min(volume, 1));
  audio.play().catch(() => undefined);
}

function encodeRichMessage(message: RichMessage) {
  return `::sg:${JSON.stringify(message)}`;
}

function parseRichMessage(content: string): RichMessage {
  if (!content.startsWith("::sg:")) return { type: "text", text: content };
  try {
    return JSON.parse(content.slice(5)) as RichMessage;
  } catch {
    return { type: "text", text: content };
  }
}

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
  const [activeCommunity, setActiveCommunity] = useState<Community | null>(null);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [activeGroup, setActiveGroup] = useState<ChatGroup | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [friendRequests, setFriendRequests] = useState<User[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<User[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [callRoom, setCallRoom] = useState<CallRoom | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [pendingCall, setPendingCall] = useState<PendingCall | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
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
    setSocketInstance(socket);
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
      if (me.settings?.ringSound !== false) playUiSound("/sounds/vozmi-telefon-detka.mp3", Number(me.settings?.ringVolume ?? 80) / 100);
      setIncomingCall(event);
      const incoming: AppNotification = {
        id: Date.now(),
        type: "call",
        title: "Вам звонят",
        body: `${event.user?.displayName || "Кто-то"} звонит: ${event.label || "Славнограм"}`,
        targetType: "call",
        targetId: null,
        readAt: null,
        createdAt: new Date().toISOString(),
        actor: event.user ?? null,
      };
      setNotifications((current) => [incoming, ...current].slice(0, 80));
      setNotice(`${event.user?.displayName || "Кто-то"} зовёт в звонок: ${event.label || "Славнограм"}`);
      setTimeout(() => setNotice(""), 4200);
    });
    socket.on("notification:new", (notification: AppNotification) => {
      if (me.settings?.notificationSound !== false) playUiSound("/sounds/faah.mp3", Number(me.settings?.notificationVolume ?? 70) / 100);
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 80));
      setNotice(notification.title);
      setTimeout(() => setNotice(""), 2600);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
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
  const unreadNotifications = notifications.filter((item) => !item.readAt).length;

  async function refreshAll(authToken = token) {
    const [newPosts, newUsers, newCommunities] = await Promise.all([
      request<Post[]>("/posts", {}, authToken),
      request<User[]>("/users", {}, authToken),
      request<Community[]>("/communities", {}, authToken),
    ]);
    const newFriends = authToken ? await request<User[]>("/friends", {}, authToken).catch(() => []) : [];
    const newGroups = authToken ? await request<ChatGroup[]>("/chat/groups/list", {}, authToken).catch(() => []) : [];
    const newSaved = authToken ? await request<Post[]>("/posts/saved", {}, authToken).catch(() => []) : [];
    const newNotifications = authToken ? await request<AppNotification[]>("/notifications", {}, authToken).catch(() => []) : [];
    const incoming = authToken ? await request<User[]>("/friends/requests/incoming", {}, authToken).catch(() => []) : [];
    const outgoing = authToken ? await request<User[]>("/friends/requests/outgoing", {}, authToken).catch(() => []) : [];
    const admin = authToken && me?.isAdmin ? await request<AdminUser[]>("/admin/users", {}, authToken).catch(() => []) : [];
    setPosts(newPosts);
    setUsers(newUsers);
    setFriends(newFriends);
    setGroups(newGroups);
    setSavedPosts(newSaved);
    setNotifications(newNotifications);
    setFriendRequests(incoming);
    setOutgoingRequests(outgoing);
    setAdminUsers(admin);
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

  function acceptIncomingCall() {
    if (!incomingCall || !me) return;
    if (incomingCall.user) {
      setActiveChat(incomingCall.user);
      setActiveGroup(null);
    }
    setPendingCall({
      roomId: incomingCall.roomId,
      title: incomingCall.label || incomingCall.user?.displayName || "Звонок",
      participants: [me, ...(incomingCall.user ? [incomingCall.user] : [])],
    });
    setIncomingCall(null);
    setTab("chat");
  }

  function declineIncomingCall() {
    if (incomingCall && socketInstance) socketInstance.emit("call:leave", { roomId: incomingCall.roomId });
    setIncomingCall(null);
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
    setNotifications([]);
    setFriendRequests([]);
    setOutgoingRequests([]);
    setAdminUsers([]);
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
        {authed && (
          <div className="notification-wrap">
            <button className="notification-button" title="Уведомления" onClick={() => setNotificationsOpen((open) => !open)}>
              <Bell size={19} />
              {unreadNotifications > 0 && <span>{unreadNotifications}</span>}
            </button>
            {notificationsOpen && (
              <NotificationsPanel
                notifications={notifications}
                friendRequests={friendRequests}
                token={token}
                onProfile={openProfile}
                onChange={() => refreshAll().catch(showError)}
                onClose={() => setNotificationsOpen(false)}
                onError={showError}
              />
            )}
          </div>
        )}
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
          {me?.isAdmin && <SideButton active={tab === "admin"} icon={<ShieldCheck />} label="Админка" onClick={() => setTab("admin")} />}
        </nav>
        <button className="ghost-button rail-logout" onClick={authed ? logout : () => setShowAuth(true)}>
          {authed ? <LogOut size={18} /> : <LogIn size={18} />}
          {authed ? "Выйти" : "Войти"}
        </button>
      </aside>

      <section className={tab === "chat" ? "main-stage main-stage-hidden" : "main-stage"}>
        <div className="view-stage">
          {tab === "feed" && (
            <Feed posts={posts} communities={communities} token={token} me={me} onAuth={requireAuth} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />
          )}
          {tab === "people" && (
            <People users={visibleUsers} friends={friends} requests={friendRequests} outgoing={outgoingRequests} me={me} onlineIds={onlineIds} token={token} onAuth={requireAuth} onProfile={openProfile} onChat={(user) => { setActiveChat(user); setTab("chat"); }} onChange={() => refreshAll().catch(showError)} onError={showError} />
          )}
          {tab === "communities" && <Communities communities={communities} token={token} onAuth={requireAuth} onOpen={(community) => { setActiveCommunity(community); setTab("community"); }} onChange={() => refreshAll().catch(showError)} onError={showError} />}
          {tab === "community" && <CommunityPage community={activeCommunity} posts={posts.filter((post) => post.communityId === activeCommunity?.id)} token={token} me={me} onAuth={requireAuth} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />}
          {tab === "profile" && (
            <ProfilePage user={profileUser || me} me={me} posts={profilePosts} token={token} isFriend={Boolean(profileUser && friends.some((friend) => friend.id === profileUser.id))} onAuth={requireAuth} onChat={(user) => { setActiveChat(user); setActiveGroup(null); setTab("chat"); }} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />
          )}
          {tab === "saved" && <SavedView posts={savedPosts} me={me} token={token} onAuth={requireAuth} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />}
          {tab === "settings" && <SettingsView me={me} token={token} onAuth={requireAuth} onMe={setMe} onChange={() => refreshAll().catch(showError)} onError={showError} />}
          {tab === "admin" && <AdminPanel users={adminUsers} token={token} onAuth={requireAuth} onProfile={openProfile} onChange={() => refreshAll().catch(showError)} onError={showError} />}
        </div>
      </section>

      <section className={tab === "chat" ? "persistent-messenger visible" : "persistent-messenger"}>
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
          socket={socketInstance}
          callRoom={callRoom}
          setCallRoom={setCallRoom}
          pendingCall={pendingCall}
          onPendingCallHandled={() => setPendingCall(null)}
          token={token}
          onAuth={requireAuth}
          onProfile={openProfile}
          onRefresh={() => refreshAll().catch(showError)}
          onError={showError}
        />
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

      <nav className="mobile-nav">
        <button className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}><HomeIcon size={21} /><span>Главная</span></button>
        <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}><Users size={21} /><span>Друзья</span></button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageCircle size={21} /><span>Чаты</span></button>
        <button className={tab === "communities" ? "active" : ""} onClick={() => setTab("communities")}><Radio size={21} /><span>Сообщества</span></button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => (me ? openProfile(me) : requireAuth())}><CircleUserRound size={21} /><span>Профиль</span></button>
      </nav>

      {callRoom && tab !== "chat" && (
        <button className="call-mini" onClick={() => setTab("chat")}>
          <Phone size={18} />
          <span>{callRoom.title}</span>
        </button>
      )}

      {showAuth && <AuthDialog mode={mode} setMode={setMode} onSubmit={authSubmit} onClose={() => setShowAuth(false)} />}
      {incomingCall && (
        <IncomingCallDialog call={incomingCall} onAccept={acceptIncomingCall} onDecline={declineIncomingCall} />
      )}
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

function IncomingCallDialog({ call, onAccept, onDecline }: { call: IncomingCall; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="incoming-call-overlay">
      <section className="incoming-call-card">
        <div className="incoming-pulse">
          {call.user ? <Avatar user={call.user} size="lg" glow /> : <Phone size={38} />}
        </div>
        <span>Входящий звонок</span>
        <h2>{call.user?.displayName || call.label || "Славнограм"}</h2>
        <p>{call.user ? `@${call.user.username}` : "Тебе звонят"}</p>
        <div>
          <button className="decline-call" onClick={onDecline}><PhoneOff size={22} />Отклонить</button>
          <button className="accept-call" onClick={onAccept}><Phone size={22} />Принять</button>
        </div>
      </section>
    </div>
  );
}

function NotificationsPanel({ notifications, friendRequests, token, onProfile, onChange, onClose, onError }: { notifications: AppNotification[]; friendRequests: User[]; token: string | null; onProfile: (user: User) => void; onChange: () => void | Promise<void>; onClose: () => void; onError: (error: unknown) => void }) {
  async function readAll() {
    if (!token) return;
    try {
      await request("/notifications/read-all", { method: "POST" }, token);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  async function answer(user: User, accept: boolean) {
    if (!token) return;
    try {
      await request(`/friends/${user.id}/${accept ? "accept" : "decline"}`, { method: "POST" }, token);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="notifications-panel">
      <header>
        <h3>Уведомления</h3>
        <div>
          <button onClick={readAll}>Прочитано</button>
          <button onClick={onClose}>×</button>
        </div>
      </header>
      {friendRequests.map((user) => (
        <article key={`req-${user.id}`} className="notification-item important">
          <Avatar user={user} size="sm" onClick={() => onProfile(user)} />
          <span>
            <strong>{user.displayName}</strong>
            <small>хочет добавить тебя в друзья</small>
          </span>
          <button className="primary-button" onClick={() => answer(user, true)}>Принять</button>
          <button className="ghost-button" onClick={() => answer(user, false)}>Отклонить</button>
        </article>
      ))}
      {notifications.length ? notifications.map((item) => (
        <article className={item.readAt ? "notification-item" : "notification-item unread"} key={item.id}>
          {item.actor ? <Avatar user={item.actor} size="sm" onClick={() => onProfile(item.actor!)} /> : <span className="group-avatar"><Bell size={18} /></span>}
          <span>
            <strong>{item.title}</strong>
            <small>{item.body || new Date(item.createdAt).toLocaleString("ru-RU")}</small>
          </span>
        </article>
      )) : <p className="muted">Пока тихо</p>}
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
  onChange: () => void | Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [mediaName, setMediaName] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video" | "">("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  function mediaChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      setMediaName("");
      setMediaPreview("");
      setMediaType("");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      return;
    }
    setMediaName(file.name);
    setMediaType(file.type.startsWith("video/") ? "video" : "image");
    setMediaPreview(URL.createObjectURL(file));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request<Post>("/posts", { method: "POST", body: form }, token);
      formElement.reset();
      setMediaName("");
      setMediaPreview("");
      setMediaType("");
      await Promise.resolve(onChange());
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
            {mediaPreview && (
              <div className="attachment-list">
                <div className="attachment-item">
                  {mediaType === "video" ? <video src={mediaPreview} muted /> : <img src={mediaPreview} alt="" />}
                  <span>
                    <strong>{mediaName}</strong>
                    <small>{mediaType === "video" ? "Видео" : "Изображение"} прикреплено к посту</small>
                  </span>
                  <button type="button" onClick={() => {
                    setMediaName("");
                    setMediaPreview("");
                    setMediaType("");
                    if (mediaInputRef.current) mediaInputRef.current.value = "";
                  }}>×</button>
                </div>
              </div>
            )}
            <div className="compose-actions">
              <label title="Фото или видео">
                <ImageIcon size={20} />
                <input ref={mediaInputRef} name="media" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={mediaChanged} />
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
        <PostCard key={post.id} post={post} me={me} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />
      ))}
    </div>
  );
}

function PostCard({ post, me, token, onAuth, onProfile, onChange, onError }: { post: Post; me?: User | null; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const canManage = Boolean(me && (me.id === post.author.id || me.isAdmin));

  async function like() {
    if (!token) return void onAuth();
    try {
      await request(`/posts/${post.id}/like`, { method: "POST" }, token);
      onChange();
    } catch (error) {
      onError(error);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    try {
      await request(`/posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ text: editText }) }, token);
      setEditing(false);
      setMenuOpen(false);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  async function remove() {
    if (!token) return void onAuth();
    if (!confirm("Удалить пост?")) return;
    try {
      await request(`/posts/${post.id}`, { method: "DELETE" }, token);
      setMenuOpen(false);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request(`/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ text: form.get("text") }) }, token);
      formElement.reset();
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
        {canManage ? (
          <div className="post-menu">
            <button type="button" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={20} /></button>
            {menuOpen && (
              <div>
                <button type="button" onClick={() => setEditing(true)}>Редактировать</button>
                <button type="button" onClick={remove}>Удалить</button>
              </div>
            )}
          </div>
        ) : <MoreHorizontal size={20} />}
      </header>
      {editing ? (
        <form className="post-edit-form" onSubmit={update}>
          <textarea value={editText} onChange={(event) => setEditText(event.target.value)} />
          <div>
            <button type="button" className="ghost-button" onClick={() => setEditing(false)}>Отмена</button>
            <button className="primary-button">Сохранить</button>
          </div>
        </form>
      ) : (
        <>
          {post.text && <p className="post-text">{post.text}</p>}
          {post.tags?.length ? <div className="tag-row">{post.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
        </>
      )}
      {(post.mediaUrl || post.photoUrl) && (post.mediaType === "video" ? (
        <video className="post-photo post-video" src={assetUrl(post.mediaUrl || post.photoUrl)} controls playsInline />
      ) : (
        <img className="post-photo" alt="" src={assetUrl(post.mediaUrl || post.photoUrl)} />
      ))}
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

function People({ users, friends, requests, outgoing, me, onlineIds, token, onAuth, onProfile, onChat, onChange, onError }: { users: User[]; friends: User[]; requests: User[]; outgoing: User[]; me: User | null; onlineIds: number[]; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChat: (user: User) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
  const friendIds = new Set(friends.map((user) => user.id));
  const outgoingIds = new Set(outgoing.map((user) => user.id));

  async function add(user: User) {
    if (!token) return void onAuth();
    try {
      await request(`/friends/${user.id}`, { method: "POST" }, token);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  async function answer(user: User, accept: boolean) {
    if (!token) return void onAuth();
    try {
      await request(`/friends/${user.id}/${accept ? "accept" : "decline"}`, { method: "POST" }, token);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="people-grid">
      {requests.length > 0 && (
        <section className="requests-card">
          <h3>Заявки в друзья</h3>
          {requests.map((user) => (
            <div key={user.id}>
              <Avatar user={user} size="sm" />
              <span>{user.displayName}</span>
              <button className="primary-button" onClick={() => answer(user, true)}>Принять</button>
              <button className="ghost-button" onClick={() => answer(user, false)}>Отклонить</button>
            </div>
          ))}
        </section>
      )}
      {users.filter((user) => user.id !== me?.id).map((user) => {
        const isFriend = friendIds.has(user.id);
        const requested = outgoingIds.has(user.id) || user.friendStatus === "outgoing";
        const incoming = user.friendStatus === "incoming";
        const online = onlineIds.includes(user.id) || user.online;
        return (
          <article className="person-card" key={user.id}>
            <Avatar user={user} size="lg" glow onClick={() => onProfile(user)} />
            <strong>{user.displayName}</strong>
            <span className={online ? "online" : ""}>{online ? "онлайн" : `@${user.username}`}</span>
            <div>
              <button className="ghost-button" onClick={() => onProfile(user)}>Страница</button>
              {incoming ? (
                <button className="primary-button" onClick={() => answer(user, true)}>Принять</button>
              ) : (
                <button className="primary-button" disabled={requested} onClick={() => (isFriend ? onChat(user) : add(user))}>{isFriend ? "Написать" : requested ? "Заявка отправлена" : "Добавить"}</button>
              )}
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
  pendingCall,
  onPendingCallHandled,
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
  pendingCall: PendingCall | null;
  onPendingCallHandled: () => void;
  token: string | null;
  onAuth: () => boolean;
  onProfile: (user: User) => void;
  onRefresh: () => void;
  onError: (error: unknown) => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [messageSearch, setMessageSearch] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<RemoteAudioStream[]>([]);
  const [callParticipants, setCallParticipants] = useState<User[]>([]);
  const [participantMenu, setParticipantMenu] = useState<{ user: User; x: number; y: number } | null>(null);
  const [volumes, setVolumes] = useState<Record<number, number>>({});
  const [mutedUsers, setMutedUsers] = useState<Record<number, boolean>>({});
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [callSettingsOpen, setCallSettingsOpen] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [voiceThreshold, setVoiceThreshold] = useState(35);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
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
      setCallParticipants((current) => current.some((user) => user.id === event.user!.id) ? current : [...current, event.user!]);
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
      setCallParticipants((current) => current.filter((user) => user.id !== event.userId));
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

  useEffect(() => {
    if (!pendingCall || !me || !socket) return;
    void joinCall(pendingCall.roomId, pendingCall.title, pendingCall.participants.length ? pendingCall.participants : [me])
      .finally(onPendingCallHandled);
  }, [pendingCall, me, socket]);

  async function ensureLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression,
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

  function sendContent(content: string) {
    if (!me || !socket) return void onAuth();
    if (!content.trim()) return;
    if (activeGroup) {
      socket.emit("chat:group-send", { groupId: activeGroup.id, content });
    } else if (active) {
      socket.emit("chat:send", { toUserId: active.id, content });
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const content = String(form.get("content") || "").trim();
    sendContent(content);
    formElement.reset();
  }

  function insertEmoji(emoji: string) {
    const input = messageInputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
  }

  async function uploadChatFile(file: File) {
    if (!token) {
      onAuth();
      return null;
    }
    const form = new FormData();
    form.set("file", file);
    return request<{ url: string; name: string; type: string; size: number }>("/chat/upload", { method: "POST", body: form }, token);
  }

  async function attachFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const uploaded = await uploadChatFile(file);
      if (!uploaded) return;
      sendContent(encodeRichMessage({ type: "file", url: uploaded.url, name: uploaded.name, mime: uploaded.type, size: uploaded.size }));
    } catch (error) {
      onError(error);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        try {
          const blob = new Blob(recorderChunksRef.current, { type: "audio/webm" });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
          const uploaded = await uploadChatFile(file);
          if (uploaded) sendContent(encodeRichMessage({ type: "voice", url: uploaded.url, name: uploaded.name, mime: uploaded.type, size: uploaded.size }));
        } catch (error) {
          onError(error);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      onError(error);
    }
  }

  function messageMatchesSearch(message: Message | GroupMessage) {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return true;
    const rich = parseRichMessage(message.content);
    const text = rich.type === "text" ? rich.text : rich.name;
    return `${text} ${message.sender?.displayName ?? ""}`.toLowerCase().includes(query);
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
    const roomId = activeGroup ? `group-${activeGroup.id}` : `direct-${[me.id, active!.id].sort((a, b) => a - b).join("-")}`;
    const participants = [me, ...(activeGroup ? activeGroup.members.filter((user) => user.id !== me.id) : active ? [active] : [])];
    await joinCall(roomId, title, participants);
  }

  async function joinCall(roomId: string, title: string, participants: User[]) {
    if (!me || !socket) return void onAuth();
    try {
      await ensureLocalStream();
    } catch {
      onError(new Error("Браузер не дал доступ к микрофону"));
      return;
    }
    setCallParticipants(participants);
    navigator.mediaDevices?.enumerateDevices?.().then(setDevices).catch(() => undefined);
    socket.emit("call:join", { roomId, label: title });
    setCallRoom({ id: roomId, title, muted: false });
  }

  function leaveCall() {
    endLocalCall();
    setCallParticipants([]);
    setCameraOn(false);
    setScreenOn(false);
  }

  async function toggleCamera() {
    if (!cameraOn) {
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        for (const track of camera.getVideoTracks()) {
          localStreamRef.current?.addTrack(track);
          for (const peer of peersRef.current.values()) peer.addTrack(track, localStreamRef.current!);
        }
        setCameraOn(true);
      } catch (error) {
        onError(error);
      }
      return;
    }
    localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
    setCameraOn(false);
  }

  async function toggleScreen() {
    if (!screenOn) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        for (const track of screen.getVideoTracks()) {
          localStreamRef.current?.addTrack(track);
          for (const peer of peersRef.current.values()) peer.addTrack(track, localStreamRef.current!);
        }
        setScreenOn(true);
      } catch (error) {
        onError(error);
      }
      return;
    }
    localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
    setScreenOn(false);
  }

  const currentTitle = activeGroup?.name || active?.displayName || "Выбери диалог";
  const currentSubtitle = activeGroup ? `${activeGroup.members.length} участников` : active ? `@${active.username}` : "Личные и групповые чаты";
  const currentMessages = activeGroup ? groupMessages : messages;
  const visibleMessages = currentMessages.filter(messageMatchesSearch);

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
              <label className="message-search">
                <Search size={16} />
                <input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Поиск" />
              </label>
              <button className="call-button" onClick={startCall}><Phone size={18} />Звонок</button>
            </header>
            {callRoom && (
              <div className="call-banner">
                <span><Phone size={18} />Звонок: {callRoom.title} · {remoteStreams.length ? `${remoteStreams.length + 1} в эфире` : "ждём собеседника"}</span>
                <div className="call-avatars">
                  {callParticipants.map((user) => (
                    <button
                      key={user.id}
                      className={remoteStreams.some((item) => item.userId === user.id) || user.id === me?.id ? "call-avatar speaking" : "call-avatar"}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setParticipantMenu({ user, x: event.clientX, y: event.clientY });
                      }}
                      title="Правый клик: громкость и mute"
                    >
                      <Avatar user={user} size="sm" />
                    </button>
                  ))}
                </div>
                {remoteStreams.map((item) => <RemoteAudio key={item.userId} stream={item.stream} volume={(volumes[item.userId] ?? 100) / 100} muted={deafened || mutedUsers[item.userId]} />)}
                <button onClick={toggleMute}>{callRoom.muted ? <MicOff size={17} /> : <Mic size={17} />}</button>
                <button onClick={() => setDeafened((value) => !value)}>{deafened ? <VolumeX size={17} /> : <Headphones size={17} />}</button>
                <button onClick={toggleCamera}>{cameraOn ? <VideoOff size={17} /> : <Video size={17} />}</button>
                <button onClick={toggleScreen}><MonitorUp size={17} />{screenOn ? "Стоп" : "Демо"}</button>
                <button onClick={() => setCallSettingsOpen((open) => !open)}><Settings size={17} /></button>
                <button onClick={leaveCall}><PhoneOff size={17} />Завершить</button>
                {participantMenu && (
                  <div className="participant-menu" style={{ left: participantMenu.x, top: participantMenu.y }}>
                    <strong>{participantMenu.user.displayName}</strong>
                    <label>Громкость
                      <input type="range" min="0" max="150" value={volumes[participantMenu.user.id] ?? 100} onChange={(event) => setVolumes((current) => ({ ...current, [participantMenu.user.id]: Number(event.target.value) }))} />
                    </label>
                    <button onClick={() => setMutedUsers((current) => ({ ...current, [participantMenu.user.id]: !current[participantMenu.user.id] }))}>{mutedUsers[participantMenu.user.id] ? "Включить звук" : "Замьютить"}</button>
                    <button onClick={() => setParticipantMenu(null)}>Закрыть</button>
                  </div>
                )}
                {callSettingsOpen && (
                  <div className="call-settings-popover">
                    <strong>Настройки звонка</strong>
                    <label><input type="checkbox" checked={noiseSuppression} onChange={(event) => setNoiseSuppression(event.target.checked)} />Шумодав</label>
                    <label>Порог микрофона
                      <input type="range" min="0" max="100" value={voiceThreshold} onChange={(event) => setVoiceThreshold(Number(event.target.value))} />
                    </label>
                    <select defaultValue="">
                      <option value="">Микрофон по умолчанию</option>
                      {devices.filter((device) => device.kind === "audioinput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Микрофон"}</option>)}
                    </select>
                    <select defaultValue="">
                      <option value="">Наушники по умолчанию</option>
                      {devices.filter((device) => device.kind === "audiooutput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Наушники"}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div className="message-stream">
              {!me && <AuthRequired title="Сообщения доступны после входа" onAuth={() => void onAuth()} />}
              {visibleMessages.map((message) => (
                <div className={message.senderId === me?.id ? "message-bubble mine" : "message-bubble"} key={message.id}>
                  {activeGroup && <small>{message.sender?.displayName}</small>}
                  <MessageContent content={message.content} />
                </div>
              ))}
            </div>
            <form className="message-form" onSubmit={send}>
              <button type="button" title="Файл" onClick={() => me ? fileInputRef.current?.click() : onAuth()}><Paperclip size={19} /></button>
              <input ref={fileInputRef} hidden type="file" onChange={attachFile} />
              <div className="message-input-wrap">
                <input ref={messageInputRef} name="content" placeholder={me ? "Напиши сообщение" : "Войдите, чтобы написать"} />
                <button type="button" title="Смайлики" onClick={() => setEmojiOpen((open) => !open)}><Smile size={18} /></button>
                {emojiOpen && (
                  <div className="emoji-popover">
                    {["😀", "😂", "😍", "😎", "😭", "🔥", "💜", "👍", "🎮", "🎧", "👀", "✨"].map((emoji) => (
                      <button type="button" key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className={recording ? "recording-button active" : "recording-button"} title="Голосовое" onClick={toggleRecording}>{recording ? <Square size={18} /> : <Mic size={18} />}</button>
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

function RemoteAudio({ stream, volume, muted }: { stream: MediaStream; volume: number; muted?: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.volume = Math.max(0, Math.min(volume, 1));
    ref.current.muted = Boolean(muted);
  }, [stream, volume, muted]);

  return <audio ref={ref} autoPlay playsInline />;
}

function MessageContent({ content }: { content: string }) {
  const message = parseRichMessage(content);
  if (message.type === "voice") {
    return (
      <div className="voice-message">
        <Mic size={16} />
        <audio src={assetUrl(message.url)} controls />
      </div>
    );
  }
  if (message.type === "file") {
    const image = message.mime.startsWith("image/");
    const video = message.mime.startsWith("video/");
    return (
      <a className="file-message" href={assetUrl(message.url)} target="_blank" rel="noreferrer">
        {image && <img src={assetUrl(message.url)} alt="" />}
        {video && <video src={assetUrl(message.url)} muted />}
        {!image && !video && <Paperclip size={18} />}
        <span>
          <strong>{message.name}</strong>
          <small>{Math.ceil((message.size ?? 0) / 1024)} KB</small>
        </span>
      </a>
    );
  }
  return <>{message.text}</>;
}

function SavedView({ posts, me, token, onAuth, onProfile, onChange, onError }: { posts: Post[]; me: User | null; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
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
        <PostCard key={post.id} post={post} me={me} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />
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
  const [topics, setTopics] = useState<string[]>(Array.isArray(me?.settings?.topics) ? (me?.settings?.topics as string[]) : []);
  const [notificationSound, setNotificationSound] = useState(me?.settings?.notificationSound !== false);
  const [ringSound, setRingSound] = useState(me?.settings?.ringSound !== false);
  const [notificationVolume, setNotificationVolume] = useState(Number(me?.settings?.notificationVolume ?? 70));
  const [ringVolume, setRingVolume] = useState(Number(me?.settings?.ringVolume ?? 80));
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
        { method: "PATCH", body: JSON.stringify({ compactFeed, reduceMotion, privateProfile, messageRequests, callQuality, autoModeration: true, topics, notificationSound, ringSound, notificationVolume, ringVolume }) },
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
        <label><input type="checkbox" checked={notificationSound} onChange={(event) => setNotificationSound(event.target.checked)} />Звук уведомлений Faah</label>
        <label>Громкость уведомлений
          <input type="range" min="0" max="100" value={notificationVolume} onChange={(event) => setNotificationVolume(Number(event.target.value))} />
        </label>
        <label><input type="checkbox" checked={ringSound} onChange={(event) => setRingSound(event.target.checked)} />Звук входящего звонка</label>
        <label>Громкость звонка
          <input type="range" min="0" max="100" value={ringVolume} onChange={(event) => setRingVolume(Number(event.target.value))} />
        </label>
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
        <div className="topic-picker">
          <strong>Интересы для рекомендаций</strong>
          {topicOptions.map((topic) => (
            <button
              type="button"
              className={topics.includes(topic) ? "topic-chip active" : "topic-chip"}
              key={topic}
              onClick={() => setTopics((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic])}
            >
              #{topic}
            </button>
          ))}
        </div>
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

function Communities({ communities, token, onAuth, onOpen, onChange, onError }: { communities: Community[]; token: string | null; onAuth: () => boolean; onOpen: (community: Community) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request("/communities", { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description") }) }, token);
      formElement.reset();
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  async function subscribe(id: number) {
    if (!token) return void onAuth();
    await request(`/communities/${id}/subscribe`, { method: "POST" }, token);
    await Promise.resolve(onChange());
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
            <button className="community-icon" onClick={() => onOpen(community)}>{community.name.slice(0, 1).toUpperCase()}</button>
            <div>
              <button className="community-title" onClick={() => onOpen(community)}><h3>{community.name}</h3></button>
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

function CommunityPage({ community, posts, token, me, onAuth, onProfile, onChange, onError }: { community: Community | null; posts: Post[]; token: string | null; me: User | null; onAuth: () => boolean; onProfile: (user: User) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
  if (!community) return <AuthRequired title="Сообщество не выбрано" onAuth={() => undefined} />;
  const currentCommunity = community;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set("communityId", String(currentCommunity.id));
    try {
      await request<Post>("/posts", { method: "POST", body: form }, token);
      formElement.reset();
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  async function subscribe() {
    if (!token) return void onAuth();
    try {
      await request(`/communities/${currentCommunity.id}/subscribe`, { method: "POST" }, token);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="community-page">
      <div className="community-hero">
        <span className="community-icon big">{community.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <h2>{community.name}</h2>
          <p>{community.description || "Страница сообщества Славнограма"}</p>
          <small>{community.membersCount} участников</small>
        </div>
        <button className={community.joinedByMe ? "primary-button joined" : "primary-button"} onClick={subscribe}>
          <Check size={18} />
          {community.joinedByMe ? "Внутри" : "Подписаться"}
        </button>
      </div>
      {token ? (
        <form className="compose-card community-compose" onSubmit={create}>
          <Avatar user={me} size="md" />
          <div>
            <strong>Пост в {community.name}</strong>
            <textarea name="text" placeholder="Текст, #хештеги и тема поста" />
            <div className="compose-actions">
              <label title="Фото или видео">
                <ImageIcon size={20} />
                <input name="media" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" />
              </label>
              <button className="primary-button">Опубликовать</button>
            </div>
          </div>
        </form>
      ) : <AuthRequired title="Публикация доступна после входа" onAuth={() => void onAuth()} />}
      <div className="feed-stack">
        {posts.map((post) => <PostCard key={post.id} post={post} me={me} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />)}
      </div>
    </section>
  );
}

function AdminPanel({ users, token, onAuth, onProfile, onChange, onError }: { users: AdminUser[]; token: string | null; onAuth: () => boolean; onProfile: (user: User) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
  if (!token) return <AuthRequired title="Админка доступна после входа" onAuth={() => void onAuth()} />;

  async function action(path: string, method = "POST") {
    try {
      await request(path, { method }, token);
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="admin-panel">
      <header className="content-card rec-card">
        <h3><ShieldCheck size={20} />Админ-панель</h3>
        <p>Доступ только для slavnyj_paren. Здесь видно пользователей, онлайн и быстрые действия модерации.</p>
      </header>
      <div className="admin-table">
        {users.map((user) => (
          <article key={user.id}>
            <Avatar user={user} size="sm" onClick={() => onProfile(user)} />
            <span>
              <strong>{user.displayName}</strong>
              <small>@{user.username} · {user.online ? "онлайн" : "оффлайн"} · {user.postsCount} постов</small>
            </span>
            <button className="ghost-button" onClick={() => action(`/admin/users/${user.id}/block`)}>{user.blocked ? "Разблокировать" : "Блок"}</button>
            <button className="ghost-button danger" onClick={() => confirm("Удалить аккаунт?") && action(`/admin/users/${user.id}`, "DELETE")}>Удалить</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfilePage({ user, me, posts, token, isFriend, onAuth, onChat, onProfile, onChange, onError }: { user: User | null; me: User | null; posts: Post[]; token: string | null; isFriend: boolean; onAuth: () => boolean; onChat: (user: User) => void; onProfile: (user: User) => void; onChange: () => void | Promise<void>; onError: (error: unknown) => void }) {
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return void onAuth();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request<Post>("/posts", { method: "POST", body: form }, token);
      formElement.reset();
      await Promise.resolve(onChange());
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
      {mine && (
        <form className="compose-card" onSubmit={create}>
          <Avatar user={me} size="md" />
          <div>
            <strong>Пост на моей странице</strong>
            <textarea name="text" placeholder="Что нового? Добавь #хештеги для рекомендаций" />
            <div className="compose-actions">
              <label title="Фото или видео">
                <ImageIcon size={20} />
                <input name="media" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" />
              </label>
              <button className="primary-button">Опубликовать</button>
            </div>
          </div>
        </form>
      )}
      <div className="feed-stack">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} me={me} token={token} onAuth={onAuth} onProfile={onProfile} onChange={onChange} onError={onError} />
        ))}
      </div>
    </section>
  );
}
