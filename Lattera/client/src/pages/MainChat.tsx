<<<<<<< HEAD
import { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Phone, MoreVertical, Loader2 } from 'lucide-react';

import type { NavigateFn } from '../routes';
import type {
  ChatResponseData,
  MessageWithSenderResponse,
  MessageResponse,
} from '../types/api';

import { api } from '../services/api';
import { socketService } from '../services/socketService';
import { useApp } from '../contexts/AppContext';
import Logo from '../components/Logo';
import ChatList from '../components/ChatList';
import MessageWindow from '../components/MessageWindow';
import MessageComposer from '../components/MessageComposer';

export default function MainChat({ onNavigate }: { onNavigate: NavigateFn }) {
  const { user, addToast } = useApp();
  const [chats, setChats] = useState<ChatResponseData[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSenderResponse[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const loadChats = useCallback(async () => {
    try {
      setChatsLoading(true);
      const response = await api.chats.list({ limit: 50, offset: 0 });
      setChats(response.chats);
    } catch (error) {
      console.error('Error loading chats:', error);
      addToast('error', 'Не удалось загрузить список чатов');
    } finally {
      setChatsLoading(false);
    }
  }, [addToast]);

  const loadMessages = useCallback(
    async (chatId: string, offset = 0) => {
      try {
        setMessagesLoading(true);
        const response = await api.messages.list({
          chatId,
          limit: 50,
          offset,
        });

        if (offset === 0) {
          setMessages(response.messages.reverse());
        } else {
          setMessages((prev) => [...response.messages.reverse(), ...prev]);
        }

        setHasMoreMessages(response.messages.length === 50);
        setMessagesOffset(offset + response.messages.length);
      } catch (error) {
        console.error('Error loading messages:', error);
        addToast('error', 'Не удалось загрузить сообщения');
      } finally {
        setMessagesLoading(false);
      }
    },
    [addToast]
  );

  const handleChatSelect = useCallback(
    (chatId: string) => {
      setSelectedChatId(chatId);
      setMessages([]);
      setMessagesOffset(0);
      setTypingUsers(new Set());
      loadMessages(chatId);
    },
    [loadMessages]
  );

  const handleLoadMoreMessages = useCallback(() => {
    if (selectedChatId && hasMoreMessages && !messagesLoading) {
      loadMessages(selectedChatId, messagesOffset);
    }
  }, [selectedChatId, hasMoreMessages, messagesLoading, messagesOffset, loadMessages]);

  const handleSendMessage = useCallback(
    async (content: string, mediaFile?: File) => {
      if (!selectedChatId || !user) return;

      const tempId = `temp-${Date.now()}`;
      const tempMessage: MessageWithSenderResponse = {
        id: tempId,
        chatId: selectedChatId,
        senderId: user.id,
        sender: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        content,
        media: null,
        editedAt: null,
        deletedFor: [],
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempMessage]);

      try {
        let mediaData = undefined;

        if (mediaFile) {
          try {
            const uploadResponse = await api.media.upload({
              file: mediaFile,
              userId: user.id,
            });

            mediaData = {
              type: uploadResponse.data.type,
              url: uploadResponse.data.url,
            };
          } catch (error) {
            console.error('Error uploading media:', error);
            addToast('error', 'Не удалось загрузить файл');
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            return;
          }
        }

        const response = await api.messages.send({
          chatId: selectedChatId,
          content: content || undefined,
          media: mediaData,
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...response.data,
                  sender: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                  },
                }
              : m
          )
        );

        setChats((prev) =>
          prev.map((chat) =>
            chat.id === selectedChatId
              ? {
                  ...chat,
                  lastMessage: {
                    content: response.data.content,
                    senderId: user.id,
                    timestamp: response.data.timestamp,
                  },
                }
              : chat
          )
        );
      } catch (error) {
        console.error('Error sending message:', error);
        addToast('error', 'Не удалось отправить сообщение');
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [selectedChatId, user, addToast]
  );

  const handleTyping = useCallback(() => {
    if (selectedChatId) {
      socketService.emitTyping(selectedChatId);
    }
  }, [selectedChatId]);

  const handleStopTyping = useCallback(() => {
    if (selectedChatId) {
      socketService.emitStopTyping(selectedChatId);
    }
  }, [selectedChatId]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!user) return;

    try {
      socketService.initialize();

      const unsubscribeNewMessage = socketService.onNewMessage(
        (message: MessageResponse) => {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === message.id);
            if (exists) return prev;

            const messageWithSender: MessageWithSenderResponse = {
              ...message,
              sender: message.sender || {
                id: message.senderId,
                firstName: '',
                lastName: '',
              },
            };

            return [...prev, messageWithSender];
          });

          setChats((prev) =>
            prev.map((chat) =>
              chat.id === message.chatId
                ? {
                    ...chat,
                    lastMessage: {
                      content: message.content,
                      senderId: message.senderId,
                      timestamp: message.timestamp,
                    },
                    unreadCount:
                      message.senderId !== user.id
                        ? {
                            ...chat.unreadCount,
                            [user.id]: (chat.unreadCount[user.id] || 0) + 1,
                          }
                        : chat.unreadCount,
                  }
                : chat
            )
          );
        }
      );

      const unsubscribeUserStatus = socketService.onUserStatus((status) => {
        setOnlineUsers((prev) => {
          const newSet = new Set(prev);
          if (status.status === 'online') {
            newSet.add(status.userId);
          } else {
            newSet.delete(status.userId);
          }
          return newSet;
        });
      });

      const unsubscribeTyping = socketService.onTyping((event) => {
        if (event.chatId !== selectedChatId) return;

        if (event.isTyping) {
          setTypingUsers((prev) => new Set(prev).add(event.userId));

          const existingTimeout = typingTimeoutRef.current.get(event.userId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          const timeout = setTimeout(() => {
            setTypingUsers((prev) => {
              const newSet = new Set(prev);
              newSet.delete(event.userId);
              return newSet;
            });
            typingTimeoutRef.current.delete(event.userId);
          }, 5000);

          typingTimeoutRef.current.set(event.userId, timeout);
        } else {
          setTypingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(event.userId);
            return newSet;
          });

          const existingTimeout = typingTimeoutRef.current.get(event.userId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            typingTimeoutRef.current.delete(event.userId);
          }
        }
      });

      const unsubscribeMessageEdited = socketService.onMessageEdited((data) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, content: data.content, editedAt: data.editedAt }
              : m
          )
        );
      });

      const unsubscribeMessageDeleted = socketService.onMessageDeleted((data) => {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      });

      return () => {
        unsubscribeNewMessage();
        unsubscribeUserStatus();
        unsubscribeTyping();
        unsubscribeMessageEdited();
        unsubscribeMessageDeleted();
        socketService.disconnect();

        const timeouts = typingTimeoutRef.current;
        timeouts.forEach((timeout) => clearTimeout(timeout));
        timeouts.clear();
      };
    } catch (error) {
      console.error('Error initializing socket:', error);
    }
  }, [user, selectedChatId]);

  if (!user) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <Loader2 size={48} className="text-[#2290FF] animate-spin" />
      </div>
    );
  }

  const getOtherParticipant = (chat: ChatResponseData) => {
    return chat.participants.find((p) => p.id !== user.id);
  };

  const participantNames = new Map<string, string>();
  if (selectedChat) {
    selectedChat.participants.forEach((p) => {
      participantNames.set(p.id, `${p.firstName} ${p.lastName}`);
    });
  }

=======
import { useState } from 'react';
import { Search, Send, Paperclip, Smile, Mic, Video, Phone, MoreVertical } from 'lucide-react';
import Logo from '../components/Logo';

interface User {
  id: string;
  name: string;
  avatar: string;
  position: string;
  company: string;
  category: string;
  skills: string[];
  isOnline: boolean;
  lastSeen?: string;
}

interface Chat {
  id: string;
  user: User;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface Message {
  id: string;
  content: string;
  timestamp: string;
  isMine: boolean;
  status: 'sent' | 'read';
}

const MOCK_CHATS: Chat[] = [
  {
    id: '1',
    user: {
      id: '1',
      name: 'Анна Смирнова',
      avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?w=100',
      position: 'Frontend Developer',
      company: 'Yandex',
      category: 'IT & Разработка',
      skills: ['React', 'TypeScript', 'Tailwind'],
      isOnline: true,
    },
    lastMessage: 'Отлично, давайте обсудим детали проекта',
    lastMessageTime: '14:32',
    unreadCount: 2,
  },
  {
    id: '2',
    user: {
      id: '2',
      name: 'Дмитрий Волков',
      avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?w=100',
      position: 'UI/UX Designer',
      company: 'Figma',
      category: 'Дизайн',
      skills: ['Figma', 'Prototyping', 'User Research'],
      isOnline: false,
      lastSeen: 'вчера',
    },
    lastMessage: 'Спасибо за фидбек! Внесу правки',
    lastMessageTime: 'Вчера',
    unreadCount: 0,
  },
];

const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    content: 'Привет! Увидел ваш профиль, интересный опыт',
    timestamp: '14:28',
    isMine: false,
    status: 'read',
  },
  {
    id: '2',
    content: 'Здравствуйте! Спасибо, рад знакомству',
    timestamp: '14:30',
    isMine: true,
    status: 'read',
  },
  {
    id: '3',
    content: 'Отлично, давайте обсудим детали проекта',
    timestamp: '14:32',
    isMine: false,
    status: 'sent',
  },
];

export default function MainChat({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [selectedChatId, setSelectedChatId] = useState<string>('1');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedChat = MOCK_CHATS.find((c) => c.id === selectedChatId);

  const filteredChats = MOCK_CHATS.filter((chat) =>
    chat.user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (!message.trim()) return;
    setMessage('');
  };

>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2
  return (
    <div className="h-screen bg-white flex flex-col">
      <header className="h-16 border-b border-[#E5E7EB] px-6 flex items-center justify-between bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <Logo size="sm" />
        <nav className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('/')}
            className="px-4 py-2 text-[#2290FF] bg-[#F0F9FF] rounded-lg font-medium"
          >
            Чаты
          </button>
          <button
            onClick={() => onNavigate('/search')}
            className="px-4 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg font-medium transition-colors"
          >
            Поиск
          </button>
          <button
            onClick={() => onNavigate('/settings')}
            className="px-4 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg font-medium transition-colors"
          >
            Настройки
          </button>
        </nav>
      </header>

      <div className="flex-1 flex overflow-hidden">
<<<<<<< HEAD
        <ChatList
          chats={chats}
          selectedChatId={selectedChatId}
          onChatSelect={handleChatSelect}
          onlineUsers={onlineUsers}
          loading={chatsLoading}
          currentUserId={user.id}
        />
=======
        <aside className="w-80 border-r border-[#E5E7EB] flex flex-col bg-white">
          <div className="p-4 border-b border-[#E5E7EB]">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
              />
              <input
                type="text"
                placeholder="Поиск по людям..."
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-[#E5E7EB] focus:border-[#2290FF] focus:outline-none transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`w-full p-4 flex items-start gap-3 hover:bg-[#F3F4F6] transition-colors border-b border-[#E5E7EB] ${
                  selectedChatId === chat.id ? 'bg-[#F9FBFF]' : ''
                }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={chat.user.avatar}
                    alt={chat.user.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  {chat.user.isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-[#1A1A1A] truncate">
                      {chat.user.name}
                    </h3>
                    <span className="text-xs text-[#6B7280] ml-2">
                      {chat.lastMessageTime}
                    </span>
                  </div>
                  <p className="text-sm text-[#6B7280] truncate">
                    {chat.lastMessage}
                  </p>
                </div>
                {chat.unreadCount > 0 && (
                  <div className="flex-shrink-0 w-5 h-5 bg-[#2290FF] text-white text-xs rounded-full flex items-center justify-center font-semibold">
                    {chat.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        </aside>
>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2

        {selectedChat ? (
          <>
            <main className="flex-1 flex flex-col bg-[#F9FBFF]">
              <div className="h-16 border-b border-[#E5E7EB] px-6 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="relative">
<<<<<<< HEAD
                    {(() => {
                      const otherParticipant = getOtherParticipant(selectedChat);
                      if (!otherParticipant) return null;

                      const isOnline = onlineUsers.has(otherParticipant.id);

                      return (
                        <>
                          <img
                            src={
                              otherParticipant.avatarUrl ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                `${otherParticipant.firstName} ${otherParticipant.lastName}`
                              )}&background=2290FF&color=fff`
                            }
                            alt={`${otherParticipant.firstName} ${otherParticipant.lastName}`}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                          {isOnline && (
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10B981] rounded-full border-2 border-white" />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    {(() => {
                      const otherParticipant = getOtherParticipant(selectedChat);
                      if (!otherParticipant) return null;

                      const isOnline = onlineUsers.has(otherParticipant.id);

                      return (
                        <>
                          <h2 className="font-semibold text-[#1A1A1A]">
                            {otherParticipant.firstName} {otherParticipant.lastName}
                          </h2>
                          <p className="text-sm text-[#6B7280]">
                            {isOnline ? 'Online' : 'Offline'}
                          </p>
                        </>
                      );
                    })()}
=======
                    <img
                      src={selectedChat.user.avatar}
                      alt={selectedChat.user.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    {selectedChat.user.isOnline && (
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10B981] rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-[#1A1A1A]">
                      {selectedChat.user.name}
                    </h2>
                    <p className="text-sm text-[#6B7280]">
                      {selectedChat.user.isOnline
                        ? 'Online'
                        : `Был ${selectedChat.user.lastSeen}`}
                    </p>
>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-10 h-10 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors">
                    <Video size={20} className="text-[#6B7280]" />
                  </button>
                  <button className="w-10 h-10 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors">
                    <Phone size={20} className="text-[#6B7280]" />
                  </button>
                  <button className="w-10 h-10 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors">
                    <MoreVertical size={20} className="text-[#6B7280]" />
                  </button>
                </div>
              </div>

<<<<<<< HEAD
              <MessageWindow
                messages={messages}
                currentUserId={user.id}
                loading={messagesLoading}
                hasMore={hasMoreMessages}
                onLoadMore={handleLoadMoreMessages}
                typingUsers={typingUsers}
                participantNames={participantNames}
              />

              <MessageComposer
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
                onStopTyping={handleStopTyping}
              />
            </main>

            <aside className="w-80 border-l border-[#E5E7EB] p-6 bg-white overflow-y-auto">
              {(() => {
                const otherParticipant = getOtherParticipant(selectedChat);
                if (!otherParticipant) return null;

                return (
                  <>
                    <div className="text-center mb-6">
                      <img
                        src={
                          otherParticipant.avatarUrl ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            `${otherParticipant.firstName} ${otherParticipant.lastName}`
                          )}&background=2290FF&color=fff`
                        }
                        alt={`${otherParticipant.firstName} ${otherParticipant.lastName}`}
                        className="w-20 h-20 rounded-full object-cover mx-auto mb-4"
                      />
                      <h2 className="text-xl font-bold text-[#1A1A1A] mb-1">
                        {otherParticipant.firstName} {otherParticipant.lastName}
                      </h2>
                      <p className="text-[#6B7280] mb-1">
                        {otherParticipant.profile.position}
                      </p>
                      <p className="text-sm text-[#6B7280]">
                        {otherParticipant.profile.company}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-[#6B7280] mb-2">
                          Категория
                        </h3>
                        <span className="inline-block px-3 py-1.5 bg-[#E0F0FF] text-[#2290FF] rounded-lg text-sm font-medium">
                          {otherParticipant.profile.category}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
=======
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {MOCK_MESSAGES.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-3 rounded-2xl ${
                        msg.isMine
                          ? 'bg-white text-[#1A1A1A] rounded-br-md'
                          : 'bg-[#F0F9FF] text-[#1A1A1A] rounded-bl-md'
                      } shadow-sm`}
                    >
                      <p>{msg.content}</p>
                      <div
                        className={`text-xs mt-1 flex items-center gap-1 ${
                          msg.isMine ? 'justify-end' : 'justify-start'
                        } text-[#6B7280]`}
                      >
                        <span>{msg.timestamp}</span>
                        {msg.isMine && (
                          <span className={msg.status === 'read' ? 'text-[#2290FF]' : ''}>
                            ✓✓
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#E5E7EB] p-4 bg-white">
                <div className="flex items-end gap-2">
                  <div className="flex gap-2">
                    <button className="w-10 h-10 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors">
                      <Paperclip size={20} className="text-[#6B7280]" />
                    </button>
                    <button className="w-10 h-10 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors">
                      <Smile size={20} className="text-[#6B7280]" />
                    </button>
                  </div>
                  <textarea
                    placeholder="Сообщение..."
                    className="flex-1 max-h-32 px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#2290FF] focus:outline-none resize-none transition-colors"
                    rows={1}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  {message.trim() ? (
                    <button
                      onClick={handleSendMessage}
                      className="w-10 h-10 rounded-lg bg-[#2290FF] hover:bg-[#1a7ae6] flex items-center justify-center transition-colors"
                    >
                      <Send size={20} className="text-white" />
                    </button>
                  ) : (
                    <button className="w-10 h-10 rounded-lg hover:bg-[#F3F4F6] flex items-center justify-center transition-colors">
                      <Mic size={20} className="text-[#6B7280]" />
                    </button>
                  )}
                </div>
              </div>
            </main>

            <aside className="w-80 border-l border-[#E5E7EB] p-6 bg-white overflow-y-auto">
              <div className="text-center mb-6">
                <img
                  src={selectedChat.user.avatar}
                  alt={selectedChat.user.name}
                  className="w-20 h-20 rounded-full object-cover mx-auto mb-4"
                />
                <h2 className="text-xl font-bold text-[#1A1A1A] mb-1">
                  {selectedChat.user.name}
                </h2>
                <p className="text-[#6B7280] mb-1">{selectedChat.user.position}</p>
                <p className="text-sm text-[#6B7280]">{selectedChat.user.company}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-[#6B7280] mb-2">Категория</h3>
                  <span className="inline-block px-3 py-1.5 bg-[#E0F0FF] text-[#2290FF] rounded-lg text-sm font-medium">
                    {selectedChat.user.category}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-[#6B7280] mb-2">Навыки</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedChat.user.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-3 py-1.5 bg-[#F0F9FF] text-[#2290FF] rounded-lg text-sm font-medium border border-[#2290FF]/20"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2
            </aside>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#F9FBFF]">
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-[#2290FF] to-[#0066CC] rounded-3xl flex items-center justify-center mx-auto mb-6">
<<<<<<< HEAD
                <Phone size={48} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2">
                Выберите чат
              </h2>
              <p className="text-[#6B7280]">
                Выберите чат из списка слева, чтобы начать общение
              </p>
=======
                <Search size={48} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2">
                Нет активных диалогов
              </h2>
              <p className="text-[#6B7280]">Начните поиск профессионалов!</p>
>>>>>>> 96201ff60245a080daa5cad290a96bfc21f231c2
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
