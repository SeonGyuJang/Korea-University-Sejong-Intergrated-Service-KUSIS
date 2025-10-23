// static/js/post_management.js
document.addEventListener('DOMContentLoaded', () => {
    const pendingPostList = document.getElementById('pendingPostList');
    const approvedPostList = document.getElementById('approvedPostList');

    // 승인 버튼 클릭 처리 (이벤트 위임)
    if (pendingPostList) {
        pendingPostList.addEventListener('click', async (event) => {
            if (event.target.classList.contains('btn-approve')) {
                const button = event.target;
                const postId = button.dataset.postId;
                if (!postId || !confirm('이 게시물을 승인하시겠습니까?')) return;

                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    const response = await fetch(`/post/${postId}/approve`, { method: 'POST' });
                    const result = await response.json();

                    if (result.status === 'success') {
                        alert(result.message);
                        // 페이지 새로고침 또는 동적으로 목록 이동
                        location.reload();
                    } else {
                        throw new Error(result.message || '승인 실패');
                    }
                } catch (error) {
                    alert(`오류: ${error.message}`);
                    button.disabled = false;
                    button.textContent = '승인';
                }
            }
        });
    }

    // 삭제 버튼 클릭 처리 (승인 대기 + 승인된 목록 모두 적용, 이벤트 위임)
    const handlePostDelete = async (event) => {
        if (event.target.classList.contains('btn-delete')) {
            const button = event.target;
            const postId = button.dataset.postId;
            if (!postId || !confirm('정말로 이 게시물을 삭제하시겠습니까?')) return;

            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(`/post/${postId}/delete`, { method: 'POST' });
                const result = await response.json();

                if (result.status === 'success') {
                    alert(result.message);
                    // 테이블에서 해당 행 제거
                    button.closest('tr')?.remove();
                } else {
                    throw new Error(result.message || '삭제 실패');
                }
            } catch (error) {
                alert(`오류: ${error.message}`);
                button.disabled = false;
                button.innerHTML = '삭제'; // 아이콘 없이 텍스트만
            }
        }
    };

    if (pendingPostList) {
        pendingPostList.addEventListener('click', handlePostDelete);
    }
    if (approvedPostList) {
        approvedPostList.addEventListener('click', handlePostDelete);
    }

}); // DOMContentLoaded end