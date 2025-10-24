// Edit Post Page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // --- 텍스트 미리보기 로직 ---
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');
    const previewTitle = document.getElementById('previewTitle');
    const previewContent = document.getElementById('previewContent');

    function updateTextPreview() {
        if (previewTitle) {
            previewTitle.textContent = titleInput.value.trim() || '제목이 여기에 표시됩니다';
        }
        if (previewContent) {
            // [수정] \n을 <br>로 변환하여 미리보기에 즉시 반영
            const contentHtml = contentInput.value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\n/g, '<br>');
            previewContent.innerHTML = contentHtml || '<p>내용이 여기에 표시됩니다.</p>';
        }
    }

    if (titleInput) titleInput.addEventListener('input', updateTextPreview);
    if (contentInput) contentInput.addEventListener('input', updateTextPreview);

    // 초기 로드 시 텍스트 미리보기 실행
    updateTextPreview();

    // --- [신규] 이미지 관리 로직 (UI/UX 개선) ---
    const imageInput = document.getElementById('imageUpload');
    const newPreviewGrid = document.getElementById('newImagePreviewGrid');
    const noNewImageText = document.getElementById('noNewImageText');
    const limitMessage = document.getElementById('imageLimitMessage');
    const deleteCheckboxes = document.querySelectorAll('.delete-image-cb');
    const MAX_IMAGES = parseInt(imageInput?.dataset.maxImages || "3", 10);

    // 현재 유지될 (삭제 체크 안 된) 기존 이미지 개수 계산
    function getCurrentVisibleImageCount() {
        let count = 0;
        deleteCheckboxes.forEach(cb => {
            if (!cb.checked) {
                count++;
            }
        });
        return count;
    }

    // 새 이미지 미리보기 처리 함수
    function handleNewImagePreview(event) {
        // 1. 상태 초기화
        newPreviewGrid.innerHTML = '';
        limitMessage.classList.remove('visible');
        noNewImageText.classList.remove('visible');

        let files = Array.from(event.target.files);
        let currentVisibleCount = getCurrentVisibleImageCount();
        const availableSlots = MAX_IMAGES - currentVisibleCount;

        // 2. 이미지 개수 제한 검사
        if (files.length > availableSlots) {
            limitMessage.classList.add('visible');
            // 허용된 개수만큼 파일 배열을 자름
            files = files.slice(0, availableSlots);
        }

        // 3. 파일이 없는 경우
        if (files.length === 0) {
            noNewImageText.classList.add('visible');
            return;
        }

        // 4. 선택된 파일 미리보기 생성
        files.forEach(file => {
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = function(e) {
                    const item = document.createElement('div');
                    item.classList.add('image-preview-item');

                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = file.name;

                    const filename = document.createElement('span');
                    filename.classList.add('image-filename');
                    filename.textContent = file.name;

                    item.appendChild(img);
                    item.appendChild(filename);
                    newPreviewGrid.appendChild(item);
                }

                reader.readAsDataURL(file);
            }
        });
    }

    // 파일 입력 시 이벤트 리스너
    if (imageInput && newPreviewGrid && noNewImageText && limitMessage) {
        imageInput.addEventListener('change', handleNewImagePreview);
    }

    // 기존 이미지 삭제 체크박스 클릭 시 이벤트 리스너
    // (삭제 체크/해제 시 새 이미지 업로드 가능 개수가 달라지므로 미리보기를 다시 그림)
    deleteCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            // 새 이미지 파일 입력을 강제로 다시 트리거
            // (이미 선택된 파일이 있다면, 그 파일 목록으로 handleNewImagePreview를 다시 호출)
            handleNewImagePreview({ target: imageInput });
        });
    });

});
