"use client";

import { useEffect, useRef } from "react";
import { Users, X, MousePointer, Wifi, Pencil, Eye, EyeOff } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import type { PresenceUser } from "@shared/types";

type ActiveUsersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  presenceUsers: PresenceUser[];
  currentUserName: string;
  onOpenUserNameModal?: () => void;
};

export function ActiveUsersModal({
  isOpen,
  onClose,
  presenceUsers,
  currentUserName,
  onOpenUserNameModal
}: ActiveUsersModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const theme = useBoardStore((state) => state.theme);
  const isLight = theme === "light";

  const currentUserId = useBoardStore((state) => state.currentUserId);
  const followingUserId = useBoardStore((state) => state.followingUserId);
  const setFollowingUserId = useBoardStore((state) => state.setFollowingUserId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const effectiveSelfId =
    currentUserId ||
    (typeof window !== "undefined" ? sessionStorage.getItem("whiteboard_user_id") : null);

  // Accurate deduplication of active participants by userId
  const userMap = new Map<string, PresenceUser>();

  for (const u of presenceUsers) {
    if (u && u.userId) {
      const isSelf = Boolean(effectiveSelfId) && u.userId === effectiveSelfId;
      userMap.set(u.userId, {
        userId: u.userId,
        name: isSelf && currentUserName ? currentUserName : (u.name || `User-${u.userId.slice(0, 4)}`),
        color: u.color || "#6366f1"
      });
    }
  }

  // Ensure current local user is always listed
  if (effectiveSelfId && !userMap.has(effectiveSelfId)) {
    userMap.set(effectiveSelfId, {
      userId: effectiveSelfId,
      name: currentUserName || "You",
      color: "#6366f1"
    });
  }

  const allUsers = Array.from(userMap.values());
  const selfUser = allUsers.find((u) => u.userId === effectiveSelfId);
  const otherUsers = allUsers.filter((u) => u.userId !== effectiveSelfId);
  const displayUsers = selfUser ? [selfUser, ...otherUsers] : allUsers;

  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1050,
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        padding: "68px 24px 24px 24px"
      }}
    >
      <div
        ref={modalRef}
        style={{
          position: "relative",
          background: isLight ? "#ffffff" : "#18181b",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "380px",
          padding: "20px",
          boxShadow: isLight
            ? "0 20px 50px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04)"
            : "0 25px 60px rgba(0, 0, 0, 0.8)",
          color: isLight ? "#0f172a" : "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          overflow: "hidden",
          animation: "slideDownCollaborators 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Active Collaborators"
      >
        <style>{`
          @keyframes slideDownCollaborators {
            from {
              opacity: 0;
              transform: translateY(-10px) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#6366f1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff"
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "15px",
                    fontWeight: 700,
                    color: isLight ? "#0f172a" : "#ffffff",
                    letterSpacing: "-0.01em"
                  }}
                >
                  Collaborators
                </h3>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)",
                    color: isLight ? "#059669" : "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "#10b981",
                      boxShadow: "0 0 6px #10b981"
                    }}
                  />
                  {displayUsers.length} {displayUsers.length === 1 ? "Online" : "Collaborating"}
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: isLight ? "#64748b" : "#94a3b8" }}>
                Live participants in this whiteboard
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close active collaborators"
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.06)",
              border: "none",
              color: isLight ? "#475569" : "#9ca3af",
              borderRadius: "8px",
              padding: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease"
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* User list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            maxHeight: "340px",
            overflowY: "auto",
            position: "relative",
            paddingRight: "2px"
          }}
        >
          {displayUsers.map((user, idx) => {
            const isSelf = Boolean(effectiveSelfId) && user.userId === effectiveSelfId;
            const isFollowing = followingUserId === user.userId;

            return (
              <div
                key={user.userId || `user-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background: isSelf
                    ? isLight
                      ? "rgba(99, 102, 241, 0.08)"
                      : "rgba(99, 102, 241, 0.15)"
                    : isFollowing
                    ? isLight
                      ? "rgba(16, 185, 129, 0.08)"
                      : "rgba(16, 185, 129, 0.15)"
                    : isLight
                    ? "#f8fafc"
                    : "rgba(255, 255, 255, 0.03)",
                  border: isSelf
                    ? isLight
                      ? "1px solid rgba(99, 102, 241, 0.25)"
                      : "1px solid rgba(99, 102, 241, 0.35)"
                    : isFollowing
                    ? "1px solid rgba(16, 185, 129, 0.4)"
                    : isLight
                    ? "1px solid rgba(0, 0, 0, 0.06)"
                    : "1px solid rgba(255, 255, 255, 0.06)",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        backgroundColor: user.color || "#6366f1",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 700,
                        border: isLight ? "2px solid #ffffff" : "2px solid #181926",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                      }}
                    >
                      {getInitials(user.name)}
                    </div>
                    {/* Glowing active online dot */}
                    <span
                      style={{
                        position: "absolute",
                        bottom: "0px",
                        right: "0px",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: "#10b981",
                        border: isLight ? "2px solid #ffffff" : "2px solid #181926",
                        boxShadow: "0 0 6px #10b981"
                      }}
                    />
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: isLight ? "#0f172a" : "#f8fafc",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "130px"
                        }}
                        title={user.name}
                      >
                        {user.name || "Collaborator"}
                      </span>
                      {isSelf && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 800,
                            padding: "1px 6px",
                            borderRadius: "6px",
                            background: isLight ? "rgba(99, 102, 241, 0.14)" : "rgba(99, 102, 241, 0.28)",
                            color: isLight ? "#4f46e5" : "#a5b4fc",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em"
                          }}
                        >
                          You
                        </span>
                      )}
                      {isFollowing && (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 800,
                            padding: "1px 5px",
                            borderRadius: "6px",
                            background: "rgba(16, 185, 129, 0.2)",
                            color: "#10b981",
                            textTransform: "uppercase"
                          }}
                        >
                          Following
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <MousePointer size={11} style={{ color: user.color || "#6366f1", flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: "11px",
                          color: isLight ? "#64748b" : "#94a3b8"
                        }}
                      >
                        {isSelf ? "Your canvas cursor" : "Live cursor active"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right action controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {isSelf ? (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenUserNameModal?.();
                      }}
                      title="Edit your display name"
                      style={{
                        background: "none",
                        border: "none",
                        padding: "5px",
                        cursor: "pointer",
                        color: isLight ? "#64748b" : "#94a3b8",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#6366f1")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = isLight ? "#64748b" : "#94a3b8")}
                    >
                      <Pencil size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setFollowingUserId(isFollowing ? null : user.userId)}
                      title={isFollowing ? "Stop following" : "Follow viewport"}
                      style={{
                        background: isFollowing ? "#10b981" : isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)",
                        color: isFollowing ? "#ffffff" : isLight ? "#475569" : "#cbd5e1",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "10px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {isFollowing ? <EyeOff size={11} /> : <Eye size={11} />}
                      <span>{isFollowing ? "Unfollow" : "Follow"}</span>
                    </button>
                  )}

                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: user.color || "#6366f1",
                      border: "1px solid rgba(255,255,255,0.4)"
                    }}
                    title={`Cursor color: ${user.color}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom banner */}
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            background: isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)",
            border: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "11px",
            color: isLight ? "#64748b" : "#94a3b8"
          }}
        >
          <Wifi size={13} style={{ color: "#10b981", flexShrink: 0 }} />
          <span>Real-time drawings and cursor positions sync live.</span>
        </div>
      </div>
    </div>
  );
}
