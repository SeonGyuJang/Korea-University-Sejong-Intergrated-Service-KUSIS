// static/js/post_management.js
document.addEventListener('DOMContentLoaded', () => {
    const pendingPostList = document.getElementById('pendingPostList');
    const approvedPostList = document.getElementById('approvedPostList');

    // 승인 버튼 클릭 처리 (기존 유지)
    if (pendingPostList) {
        pendingPostList.addEventListener('click', async (event) => {
            const button = event.target.closest('.btn-approve'); // 버튼 또는 내부 아이콘 클릭 대응
            if (button) {
                const postId = button.dataset.postId;
                if (!postId || !confirm('이 게시물을 승인하시겠습니까?')) return;

                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    const response = await fetch(`/post/${postId}/approve`, { method: 'POST' });
                    const result = await response.json();

                    if (result.status === 'success') {
                        alert(result.message);
                        location.reload(); // 페이지 새로고침
                    } else {
                        throw new Error(result.message || '승인 실패');
                    }
                } catch (error) {
                    alert(`오류: ${error.message}`);
                    button.disabled = false;
                    button.innerHTML = '<i class="fas fa-check"></i> 승인';
                }
            }
        });
    }

    // 삭제 버튼 클릭 처리 (기존 유지, 버튼 탐색 로직 수정)
    const handlePostDelete = async (event) => {
        const button = event.target.closest('.btn-delete'); // 버튼 또는 내부 아이콘 클릭 대응
        if (button) {
            const postId = button.dataset.postId;
            if (!postId || !confirm('정말로 이 게시물을 삭제하시겠습니까? 관련 이미지 파일도 함께 삭제됩니다.')) return;

            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(`/post/${postId}/delete`, { method: 'POST' });
                const result = await response.json();

                if (result.status === 'success') {
                    alert(result.message);
                    button.closest('tr')?.remove(); // 행 제거
                } else {
                    throw new Error(result.message || '삭제 실패');
                }
            } catch (error) {
                alert(`오류: ${error.message}`);
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-trash-alt"></i> 삭제';
            }
        }
    };

    if (pendingPostList) pendingPostList.addEventListener('click', handlePostDelete);
    if (approvedPostList) approvedPostList.addEventListener('click', handlePostDelete);

    // --- 요구사항 4: 표시 여부 토글 스위치 처리 ---
    if (approvedPostList) {
        approvedPostList.addEventListener('change', async (event) => {
            const toggleSwitch = event.target;
            if (toggleSwitch.classList.contains('visibility-toggle')) {
                const postId = toggleSwitch.dataset.postId;
                const isVisible = toggleSwitch.checked;
                const statusText = isVisible ? '표시' : '숨김';

                // 사용자에게 확인 (선택 사항)
                // if (!confirm(`이 게시물을 '${statusText}' 상태로 변경하시겠습니까?`)) {
                //     toggleSwitch.checked = !isVisible; // 원래 상태로 복원
                //     return;
                // }

                toggleSwitch.disabled = true; // 처리 중 비활성화

                try {
                    const response = await fetch(`/post/${postId}/toggle_visibility`, { method: 'POST' });
                    const result = await response.json();

                    if (result.status === 'success') {
                        // 성공 메시지 (선택 사항)
                        // alert(result.message);
                        // 스위치 상태가 이미 변경되었으므로 별도 UI 업데이트 불필요
                    } else {
                        throw new Error(result.message || '상태 변경 실패');
                    }
                } catch (error) {
                    alert(`오류: ${error.message}`);
                    toggleSwitch.checked = !isVisible; // 실패 시 원래 상태로 복원
                } finally {
                    toggleSwitch.disabled = false; // 처리 완료 후 활성화
                }
            }
        });
    }
    // ------------------------------------------

}); // DOMContentLoaded end