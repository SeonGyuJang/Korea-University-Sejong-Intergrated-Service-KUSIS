// static/js/community.js
document.addEventListener('DOMContentLoaded', () => {
    
    // --- 이벤트 위임을 사용하여 피드 전체에 이벤트 리스너 설정 ---
    const communityFeed = document.getElementById('communityFeed');

    if (communityFeed) {
        communityFeed.addEventListener('click', (e) => {
            // 좋아요 버튼 클릭
            const likeBtn = e.target.closest('.like-btn');
            if (likeBtn) {
                e.preventDefault();
                const postId = likeBtn.dataset.postId;
                handleLike(postId, likeBtn);
                return;
            }

            // 댓글 버튼 클릭 (댓글 창 토글)
            const commentBtn = e.target.closest('.comment-btn');
            if (commentBtn) {
                e.preventDefault();
                const postCard = commentBtn.closest('.post-card');
                const commentSection = postCard.querySelector('.comment-section');
                toggleCommentSection(postCard, commentSection);
                return;
            }

            // '댓글 N개 더 보기' 클릭
            const viewCommentsBtn = e.target.closest('.view-comments-btn');
            if (viewCommentsBtn) {
                e.preventDefault();
                const postCard = viewCommentsBtn.closest('.post-card');
                const commentListEl = postCard.querySelector('.comment-section-content');
                loadComments(postCard.dataset.postId, commentListEl, true); // 'true' = 모든 댓글 로드
                viewCommentsBtn.style.display = 'none'; // 버튼 숨김
                return;
            }

            // 공유 버튼 클릭
            const shareBtn = e.target.closest('.share-btn');
            if (shareBtn) {
                e.preventDefault();
                handleShare(shareBtn.dataset.postId);
                return;
            }
        });

        // 댓글 폼 제출 이벤트
        communityFeed.addEventListener('submit', (e) => {
            if (e.target.classList.contains('comment-input-form')) {
                e.preventDefault();
                const form = e.target;
                const postId = form.dataset.postId;
                submitComment(postId, form);
                return;
            }
        });
    }

    /**
     * 댓글 섹션을 토글하고, 처음 열릴 때 댓글을 로드합니다.
     */
    async function toggleCommentSection(postCard, commentSection) {
        if (!commentSection) return;

        const postId = postCard.dataset.postId;
        const commentListEl = commentSection.querySelector('.comment-section-content');
        const isHidden = commentSection.style.display === 'none' || commentSection.style.display === '';

        if (isHidden) {
            // 섹션을 먼저 표시
            commentSection.style.display = 'block';
            // 댓글이 로드된 적 없는지 확인
            if (!commentListEl.dataset.loaded) {
                await loadComments(postId, commentListEl, false); // false = 처음 2개만 로드
                commentListEl.dataset.loaded = 'true';
            }
        } else {
            commentSection.style.display = 'none';
        }
    }

    /**
     * 서버에 좋아요/좋아요 취소를 요청합니다.
     */
    async function handleLike(postId, buttonEl) {
        if (buttonEl.disabled) return;
        buttonEl.disabled = true;

        const isLiked = buttonEl.classList.contains('liked');
        const countSpan = buttonEl.querySelector('.like-count');
        const currentCount = parseInt(countSpan.textContent, 10);

        try {
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
            });
            const result = await response.json();

            if (result.status === 'success') {
                buttonEl.classList.toggle('liked', result.liked);
                countSpan.textContent = result.like_count;
            } else {
                throw new Error(result.message || '좋아요 처리 실패');
            }
        } catch (error) {
            console.error('Like error:', error);
            // 실패 시 UI 롤백 (임시)
            buttonEl.classList.toggle('liked', isLiked);
            countSpan.textContent = currentCount;
            alert('좋아요 처리에 실패했습니다.');
        } finally {
            buttonEl.disabled = false;
        }
    }

    /**
     * 서버에서 댓글 목록을 불러옵니다.
     * @param {string} postId - 게시물 ID
     * @param {HTMLElement} commentListEl - 댓글이 렌더링될 UL/DIV 요소
     * @param {boolean} loadAll - 모든 댓글을 로드할지 여부 (기본 2개)
     */
    async function loadComments(postId, commentListEl, loadAll = false) {
        commentListEl.innerHTML = '<p style="font-size: 13px; color: var(--text-secondary); text-align: center;">댓글 로딩 중...</p>';
        
        try {
            const response = await fetch(`/api/posts/${postId}/comments`);
            const result = await response.json();

            if (result.status === 'success') {
                // anonymity_map은 백엔드에서 처리된 'display_name'으로 대체됨
                renderComments(result.comments, commentListEl, result.post_author_id, loadAll);
            } else {
                throw new Error(result.message || '댓글 로드 실패');
            }
        } catch (error) {
            console.error('Comment load error:', error);
            commentListEl.innerHTML = `<p style="font-size: 13px; color: var(--color-danger); text-align: center;">${error.message}</p>`;
        }
    }

    /**
     * 댓글 목록을 UI에 렌더링합니다. (익명 처리 포함)
     */
    function renderComments(comments, commentListEl, postAuthorId, loadAll) {
        commentListEl.innerHTML = '';
        
        if (!comments || comments.length === 0) {
            commentListEl.innerHTML = '<p style="font-size: 13px; color: var(--text-secondary); text-align: center;">첫 번째 댓글을 남겨주세요.</p>';
            return;
        }

        // 백엔드에서 미리 계산된 display_name을 사용합니다.
        const commentsToRender = loadAll ? comments : comments.slice(0, 2);

        commentsToRender.forEach(comment => {
            const commentEl = document.createElement('div');
            commentEl.className = 'comment-item';
            
            // display_name에 따라 클래스 분기
            const isAuthor = comment.display_name === '작성자';
            const authorClass = isAuthor ? 'author' : 'anonymous';
            const authorIcon = isAuthor ? 'fa-user-edit' : 'fa-user-ninja';

            const kstDate = new Date(comment.created_at + 'Z').toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            commentEl.innerHTML = `
                <div class="comment-author-avatar">
                    <i class="fas ${authorIcon}"></i>
                </div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author ${authorClass}">${comment.display_name}</span>
                        <span class="comment-timestamp">${kstDate}</span>
                    </div>
                    <p class="comment-text">${escapeHTML(comment.content)}</p>
                </div>
            `;
            commentListEl.appendChild(commentEl);
        });

        // 모든 댓글을 로드하지 않았고, 숨겨진 댓글이 있을 경우
        if (!loadAll && comments.length > 2) {
            const remainingCount = comments.length - 2;
            const viewMoreBtn = document.createElement('button');
            viewMoreBtn.className = 'view-comments-btn';
            viewMoreBtn.textContent = `댓글 ${remainingCount}개 더 보기...`;
            commentListEl.appendChild(viewMoreBtn);
        }
    }

    /**
     * 새 댓글을 서버에 전송합니다.
     */
    async function submitComment(postId, formEl) {
        const input = formEl.querySelector('.comment-input');
        const submitBtn = formEl.querySelector('.comment-submit-btn');
        const content = input.value.trim();

        if (!content) return;

        input.disabled = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content })
            });
            const result = await response.json();

            if (result.status === 'success') {
                input.value = ''; // 입력창 비우기
                // 댓글 목록 전체 다시 로드 (방금 쓴 내 댓글 포함)
                const postCard = formEl.closest('.post-card');
                const commentListEl = postCard.querySelector('.comment-section-content');
                await loadComments(postId, commentListEl, true); // 'true' = 모든 댓글 로드

                // 댓글 수 업데이트
                const commentBtn = postCard.querySelector('.comment-btn .comment-count');
                if (commentBtn) {
                    commentBtn.textContent = result.total_comments;
                }
            } else {
                throw new Error(result.message || '댓글 등록 실패');
            }
        } catch (error) {
            console.error('Comment submit error:', error);
            alert(`댓글 등록 실패: ${error.message}`);
        } finally {
            input.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }

    /**
     * 공유하기 (클립보드에 링크 복사)
     */
    function handleShare(postId) {
        const url = `${window.location.origin}/post/${postId}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('게시물 링크가 클립보드에 복사되었습니다.');
        }, () => {
            alert('링크 복사에 실패했습니다.');
        });
    }

    /**
     * HTML 이스케이프 유틸리티
     */
    function escapeHTML(str) {
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

});