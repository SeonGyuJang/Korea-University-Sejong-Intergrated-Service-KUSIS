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

            // --- [삭제] 댓글 버튼 클릭 로직 ---
            // const commentBtn = e.target.closest('.comment-btn');
            // if (commentBtn) { ... }
            // (이제 <a> 태그이므로 JS 처리가 필요 없음)

            // 공유 버튼 클릭
            const shareBtn = e.target.closest('.share-btn');
            if (shareBtn) {
                e.preventDefault();
                handleShare(shareBtn.dataset.postId);
                return;
            }
        });

        // --- [삭제] 댓글 폼 제출 이벤트 ---
        // communityFeed.addEventListener('submit', (e) => { ... });
    }

    /**
     * 서버에 좋아요/좋아요 취소를 요청합니다.
     * (이 함수는 피드 페이지에 남아 있어야 합니다)
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

    // --- [삭제] toggleCommentSection, loadComments, renderComments, submitComment ---
    // (이 로직들은 모두 view_post.js로 이동했습니다)

    /**
     * 공유하기 (클립보드에 링크 복사)
     * (이 함수는 피드 페이지에 남아 있어야 합니다)
     */
    function handleShare(postId) {
        const url = `${window.location.origin}/post/${postId}`;
        
        // navigator.clipboard가 iframe이나 http 환경에서 작동하지 않을 수 있음
        // document.execCommand를 사용하는 레거시 폴백
        try {
            const textArea = document.createElement("textarea");
            textArea.value = url;
            textArea.style.position = "fixed";  // 안 보이게 처리
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    alert('게시물 링크가 클립보드에 복사되었습니다.');
                } else {
                    alert('링크 복사에 실패했습니다.');
                }
            } catch (err) {
                console.error('Fallback: Clipboard copy failed', err);
                alert('링크 복사에 실패했습니다.');
            }
            document.body.removeChild(textArea);
        } catch(e) {
            console.error('Clipboard copy error:', e);
            alert('링크 복사에 실패했습니다.');
        }
    }

});
