'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { StickyNote, History, Send, Trash2, Edit3, X } from 'lucide-react';
import { Button } from './Button';
import { toast } from 'sonner';
import { useConfirmDialog } from './ConfirmDialog';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';

interface Comment {
  id: string;
  text: string;
  created_at: string;
  user: {
    first_name: string;
    last_name: string;
    middle_name?: string;
    role: string;
  };
}

interface HistoryEntry {
  id: string;
  action: string;
  old_value?: string;
  new_value?: string;
  details?: string;
  created_at: string;
  user: {
    first_name: string;
    last_name: string;
    middle_name?: string;
    role: string;
  };
}

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentType: 'quote' | 'invoice' | 'supplier_order' | 'order';
  documentNumber: string;
}

export default function CommentsModal({
  isOpen,
  onClose,
  documentId,
  documentType,
  documentNumber
}: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog();

  // Получаем текущего пользователя
  const [currentUser, setCurrentUser] = useState<any>(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/users/me', undefined, true);
      if (response.ok) {
        const data = await response.json();
        const parsed = parseApiResponse<{ user?: { id: string; role: string } }>(data);
        const userData = parsed?.user ?? (parsed as any)?.user ?? (data as any)?.data?.user ?? (data as any)?.user;
        if (userData?.id) {
          setCurrentUser({ id: userData.id, role: userData.role });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      clientLogger.error('Error fetching current user', { message: err.message, stack: err.stack });
    }
  }, []);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments);
      }
    } catch (error) {
      clientLogger.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      fetchComments();
      fetchCurrentUser();
    }
  }, [isOpen, documentId, fetchComments, fetchCurrentUser]);

  const addComment = async () => {
    if (!newComment.trim() || !currentUser) return;

    clientLogger.debug('🔍 Adding comment:', {
      text: newComment.trim(),
      user_id: currentUser?.id,
      currentUser: currentUser
    });

    setSubmitting(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: newComment.trim(),
          user_id: currentUser.id
        })
      });

      clientLogger.debug('📡 Comment response:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        setComments([data.comment, ...comments]);
        setNewComment('');
        
        // Добавляем запись в историю
        await fetch(`/api/documents/${documentId}/history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'comment_added',
            user_id: currentUser.id,
            details: JSON.stringify({ comment_text: newComment.trim() })
          })
        });
      } else {
        const errorData = await response.json();
        clientLogger.error('❌ Comment error:', errorData);
        toast.error(`Ошибка при добавлении комментария: ${errorData.error}`);
      }
    } catch (error) {
      clientLogger.error('Error adding comment:', error);
      toast.error('Ошибка при добавлении комментария');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    showConfirm(
      'Удаление комментария',
      'Вы уверены, что хотите удалить этот комментарий?',
      async () => {
        try {
          const response = await fetch(`/api/documents/${documentId}/comments/${commentId}`, {
            method: 'DELETE'
          });

          if (response.ok) {
            setComments(comments.filter(c => c.id !== commentId));
            
            // Добавляем запись в историю
            if (currentUser) {
              await fetch(`/api/documents/${documentId}/history`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'comment_deleted',
                  user_id: currentUser.id,
                  details: JSON.stringify({ comment_id: commentId })
                })
              });
            }
            
            toast.success('Комментарий удален успешно');
          } else {
            toast.error('Ошибка при удалении комментария');
          }
        } catch (error) {
          clientLogger.error('Error deleting comment:', error);
          toast.error('Ошибка при удалении комментария');
        }
      },
      {
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        type: 'danger'
      }
    );
  };

  const startEdit = (comment: Comment) => {
    setEditingComment(comment.id);
    setEditText(comment.text);
  };

  const saveEdit = async (commentId: string) => {
    if (!editText.trim()) return;

    try {
      const response = await fetch(`/api/documents/${documentId}/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: editText.trim()
        })
      });

      if (response.ok) {
        setComments(comments.map(c => 
          c.id === commentId ? { ...c, text: editText.trim() } : c
        ));
        setEditingComment(null);
        setEditText('');
        
        // Добавляем запись в историю
        if (currentUser) {
          await fetch(`/api/documents/${documentId}/history`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'comment_edited',
              user_id: currentUser.id,
              details: JSON.stringify({ comment_id: commentId })
            })
          });
        }
      }
    } catch (error) {
      clientLogger.error('Error editing comment:', error);
    }
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setEditText('');
  };

  const formatUserName = (user: Comment['user']) => {
    const lastName = user.last_name;
    const firstName = user.first_name.charAt(0) + '.';
    // Показываем отчество только если оно заполнено (не пустое)
    const middleName = (user.middle_name && user.middle_name.trim()) ? user.middle_name.charAt(0) + '.' : '';
    return `${lastName} ${firstName}${middleName}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleDisplayName = (role: string) => {
    const roleMap: { [key: string]: string } = {
      'admin': 'Администратор',
      'complectator': 'Комплектатор',
      'executor': 'Исполнитель',
      'ADMIN': 'Администратор',
      'COMPLECTATOR': 'Комплектатор',
      'EXECUTOR': 'Исполнитель'
    };
    return roleMap[role] || 'Пользователь';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <StickyNote className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Комментарии - {documentType === 'quote' ? `КП ${documentNumber}` : documentType === 'invoice' ? `Счет ${documentNumber}` : documentNumber}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Add Comment Form */}
        <div className="p-6 border-b">
          <div className="flex space-x-3">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Добавить комментарий..."
              className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
            <Button
              onClick={addComment}
              disabled={!newComment.trim() || submitting}
              className="self-end"
            >
              {submitting ? '...' : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Comments List */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="text-center text-gray-500 py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2">Загрузка комментариев...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <StickyNote className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Пока нет комментариев</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-medium text-gray-900">
                          {formatUserName(comment.user)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(comment.created_at)}
                        </span>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {getRoleDisplayName(comment.user.role)}
                        </span>
                      </div>
                      
                      {editingComment === comment.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded resize-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                          />
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => saveEdit(comment.id)}
                              size="sm"
                              className="text-xs"
                            >
                              Сохранить
                            </Button>
                            <Button
                              onClick={cancelEdit}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                            >
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-700">{comment.text}</p>
                      )}
                    </div>
                    
                    {currentUser && currentUser.id === comment.user_id && editingComment !== comment.id && (
                      <div className="flex space-x-1 ml-2">
                        <button
                          onClick={() => startEdit(comment)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialogComponent />
    </div>
  );
}
