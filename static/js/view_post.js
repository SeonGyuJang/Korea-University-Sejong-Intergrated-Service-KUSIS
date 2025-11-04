// static/js/view_post.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 전역 변수 및 DOM 요소 ---
    const postContainer = document.querySelector('.view-post-page');
    if (!postContainer) {
        console.error("Post container not found.");
        return;
    }
    
    // 페이지로부터 Post ID 가져오기
    const postId = postContainer.dataset.postId;
    if (!postId) {
        console.error("Post ID not found on page.");
        return;
    }

    // --- DOM 요소 캐싱 ---
    const likeBtn = document.getElementById('post-like-btn');
    const likeCountEl = document.getElementById('post-like-count');
    const commentList = document.getElementById('comment-list');
    const commentCountDisplay = document.getElementById('comment-count-display');
    
    const newCommentForm = document.getElementById('new-comment-form');
    const newCommentInput = document.getElementById('new-comment-input');
    const newCommentSubmit = document.getElementById('new-comment-submit');

    // --- 2. 초기화 ---
    loadAndRenderComments(postId);

    // --- 3. 이벤트 리스너 바인딩 ---

    // 좋아요 버튼 클릭
    if (likeBtn) {
        likeBtn.addEventListener('click', () => handleLike(postId));
    }

    // 새 댓글 (최상위) 폼 제출
    if (newCommentForm) {
        newCommentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (newCommentInput.value.trim()) {
                submitComment(postId, newCommentInput.value, null, newCommentForm);
            }
        });
    }

    // 댓글 목록 영역에 이벤트 위임 (답글, 답글 제출, 답글 취소)
    if (commentList) {
        commentList.addEventListener('click', (e) => {
            // "답글" 버튼 클릭
            const replyBtn = e.target.closest('.comment-reply-btn');
            if (replyBtn) {
                e.preventDefault();
                const commentItem = replyBtn.closest('.comment-item');
                const commentId = commentItem.dataset.commentId;
                toggleReplyForm(commentId, commentItem);
                return;
            }

            // "답글 취소" 버튼 클릭
            const cancelBtn = e.target.closest('.btn-cancel-reply');
            if (cancelBtn) {
                e.preventDefault();
                const formContainer = cancelBtn.closest('.reply-form-container');
                if (formContainer) formContainer.innerHTML = ''; // 폼 제거
                return;
            }
        });

        // "답글 폼" 제출
        commentList.addEventListener('submit', (e) => {
            if (e.target.classList.contains('reply-form')) {
                e.preventDefault();
                const form = e.target;
                const parentId = form.dataset.parentId;
                const input = form.querySelector('.comment-input');
                if (input.value.trim()) {
                    submitComment(postId, input.value, parentId, form);
                }
            }
        });
    }

    // Textarea 자동 높이 조절
    if (newCommentInput) {
        newCommentInput.addEventListener('input', autoResizeTextarea);
    }
    if (commentList) {
        commentList.addEventListener('input', (e) => {
            if (e.target.classList.contains('comment-input')) {
                autoResizeTextarea(e);
            }
        });
    }

    // --- 4. 함수 정의 ---

    /**
     * Textarea 높이를 내용에 맞게 자동 조절
     */
    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto'; // 높이 초기화
        textarea.style.height = (textarea.scrollHeight) + 'px'; // 스크롤 높이만큼 설정
    }

    /**
     * 게시물 좋아요/좋아요 취소 처리
     */
    async function handleLike(postId) {
        if (!likeBtn || likeBtn.disabled) return;
        likeBtn.disabled = true;

        const isLiked = likeBtn.classList.contains('liked');
        const currentCount = parseInt(likeCountEl.textContent, 10);

        try {
            const response = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
            const result = await response.json();

            if (result.status === 'success') {
                likeBtn.classList.toggle('liked', result.liked);
                likeCountEl.textContent = result.like_count;
            } else {
                throw new Error(result.message || '좋아요 처리 실패');
            }
        } catch (error) {
            console.error('Like error:', error);
            alert('좋아요 처리에 실패했습니다.');
        } finally {
            likeBtn.disabled = false;
        }
    }

    /**
     * 서버에서 댓글 목록을 로드하고 렌더링
     */
    async function loadAndRenderComments(postId) {
        if (!commentList) return;
        commentList.innerHTML = '<p class="loading-comments">댓글 로딩 중...</p>';
        
        try {
            const response = await fetch(`/api/posts/${postId}/comments`);
            const result = await response.json();
            
            if (result.status !== 'success') throw new Error(result.message);
            
            renderComments(result.comments);
            if (commentCountDisplay) commentCountDisplay.textContent = result.comments.length;

        } catch (error) {
            commentList.innerHTML = '<p class="no-comments">댓글을 불러오는 데 실패했습니다.</p>';
            console.error('Comment load error:', error);
        }
    }

    /**
     * 댓글 배열을 받아 중첩된 HTML 구조로 렌더링
     */
    function renderComments(comments) {
        commentList.innerHTML = '';
        
        if (!comments || comments.length === 0) {
            commentList.innerHTML = '<p class="no-comments">아직 댓글이 없습니다. 첫 댓글을 남겨주세요.</p>';
            return;
        }

        // 1. 댓글을 ID 기준으로 매핑
        const commentsById = {};
        comments.forEach(comment => {
            commentsById[comment.id] = comment;
            comment.replies = []; // 답글을 담을 배열 초기화
        });

        // 2. 답글을 부모 댓글에 연결
        const topLevelComments = [];
        comments.forEach(comment => {
            if (comment.parent_id && commentsById[comment.parent_id]) {
                commentsById[comment.parent_id].replies.push(comment);
            } else if (!comment.parent_id) {
                topLevelComments.push(comment); // 최상위 댓글
            }
        });

        // 3. 최상위 댓글부터 렌더링
        topLevelComments.forEach(comment => {
            commentList.appendChild(createCommentElement(comment));
        });
    }

    /**
     * 댓글 객체(답글 포함)를 받아 HTML 요소를 생성
     */
    function createCommentElement(comment) {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.dataset.commentId = comment.id;

        const isAuthor = comment.display_name === '작성자';
        const authorClass = isAuthor ? 'author' : 'anonymous';
        const authorIcon = isAuthor ? 'fa-user-edit' : 'fa-user-ninja';

        const kstDate = new Date(comment.created_at + 'Z').toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        // 답글 렌더링 (재귀)
        let repliesHtml = '';
        if (comment.replies && comment.replies.length > 0) {
            repliesHtml = '<div class="reply-list">';
            comment.replies.forEach(reply => {
                // createCommentElement는 div.comment-item을 반환하므로 innerHTML을 사용
                repliesHtml += createCommentElement(reply).innerHTML; 
            });
            repliesHtml += '</div>';
        }

        commentEl.innerHTML = `
            <div class="comment-author-avatar">
                <i class="fas ${authorIcon}" title="${comment.display_name}"></i>
            </div>
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author ${authorClass}">${comment.display_name}</span>
                    <span class="comment-timestamp">${kstDate}</span>
                </div>
                <p class="comment-text">${escapeHTML(comment.content)}</p>
                <div class="comment-actions">
                    <button class="comment-reply-btn" data-comment-id="${comment.id}">
                        <i class="fas fa-reply"></i> 답글
                    </button>
                </div>
            </div>
            ${repliesHtml}
        `;
        
        // 답글 폼이 삽입될 빈 컨테이너 추가
        const replyFormContainer = document.createElement('div');
        replyFormContainer.className = 'reply-form-container';
        replyFormContainer.id = `reply-form-for-${comment.id}`;
        
        // .comment-content 뒤, .reply-list 앞에 삽입
        commentEl.querySelector('.comment-content').after(replyFormContainer);

        return commentEl;
    }

    /**
     * 답글 폼을 토글
     */
    function toggleReplyForm(commentId, commentItem) {
        const formContainerId = `reply-form-for-${commentId}`;
        const formContainer = document.getElementById(formContainerId);
        
        if (!formContainer) return;

        // 이미 폼이 열려있는지 확인
        if (formContainer.innerHTML) {
            formContainer.innerHTML = ''; // 폼 닫기
            return;
        }

        // 다른 모든 열린 답글 폼 닫기
        document.querySelectorAll('.reply-form-container').forEach(container => {
            container.innerHTML = '';
        });
        
        // 새 답글 폼 생성
        const authorName = commentItem.querySelector('.comment-author').textContent || '댓글';
        formContainer.innerHTML = `
            <form class="comment-form reply-form" data-parent-id="${commentId}">
                <div class="comment-author-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <textarea class="comment-input" placeholder="@${authorName} 님에게 답글..." rows="1" required></textarea>
                <button type="submit" class="comment-submit-btn" title="답글 등록">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <button type="button" class="btn-cancel-reply">취소</button>
            </form>
        `;
        
        const newTextarea = formContainer.querySelector('textarea');
        if (newTextarea) {
            newTextarea.focus();
            newTextarea.addEventListener('input', autoResizeTextarea);
        }
    }
    
    /**
     * 새 댓글 또는 답글을 서버로 전송
     */
    async function submitComment(postId, content, parentId, formElement) {
        if (!formElement) return;

        const input = formElement.querySelector('.comment-input');
        const submitBtn = formElement.querySelector('.comment-submit-btn');
        
        if (!content || !content.trim()) return;

        // 버튼 비활성화
        if (input) input.disabled = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const response = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    content: content.trim(), 
                    parent_id: parentId ? parseInt(parentId, 10) : null
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                // 성공 시 전체 댓글 목록 새로고침
                loadAndRenderComments(postId);
                if (commentCountDisplay) commentCountDisplay.textContent = result.total_comments;
                
                // 최상위 댓글 폼 초기화
                if (!parentId && newCommentInput) {
                    newCommentInput.value = '';
                    newCommentInput.style.height = 'auto';
                }
                // 답글 폼은 loadAndRenderComments()에 의해 자동으로 닫힘
                
            } else {
                throw new Error(result.message || '댓글 등록 실패');
            }
        } catch (error) {
            alert(`댓글 등록 실패: ${error.message}`);
        } finally {
            // 버튼 활성화
            if (input) input.disabled = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        }
    }
    
    /**
     * HTML 태그 이스케이프 유틸리티
     */
    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

}); // DOMContentLoaded 끝