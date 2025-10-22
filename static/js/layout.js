document.addEventListener('DOMContentLoaded', () => {
    // --- 사이드바 토글 기능 ---
    const leftSidebarToggle = document.getElementById('leftSidebarToggle');
    // [제거됨] rightSidebarToggle 변수
    const sidebarLeft = document.getElementById('sidebarLeft');
    // [제거됨] sidebarRight 변수

    if (leftSidebarToggle && sidebarLeft) {
        leftSidebarToggle.addEventListener('click', () => {
            sidebarLeft.classList.toggle('collapsed');
        });
    }

    // [제거됨] rightSidebarToggle 클릭 이벤트 리스너
    
    // --- 알림 드롭다운 Logic (기존 유지) ---
    const notificationToggle = document.getElementById('notificationToggle');
    const notificationDropdown = document.getElementById('notificationDropdown');

    if (notificationToggle && notificationDropdown) {
        notificationToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from propagating to document
            notificationDropdown.classList.toggle('active');
        });

        // --- 알림 위젯 내부 탭 Logic ---
        const tabs = notificationDropdown.querySelectorAll('.notification-tabs .tab');
        const contents = notificationDropdown.querySelectorAll('.notification-content .tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // 탭 활성화 상태 변경
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // 컨텐츠 표시 상태 변경
                const targetId = e.currentTarget.dataset.tab;
                contents.forEach(c => {
                    if (c.id === targetId) {
                        c.classList.add('active');
                    } else {
                        c.classList.remove('active');
                    }
                });
            });
        });
    }

    // 다른 곳 클릭 시 알림 드롭다운 닫기
    document.addEventListener('click', (e) => {
        if (notificationDropdown && notificationDropdown.classList.contains('active')) {
            // 드롭다운 자신이나 토글 버튼이 아니면 닫기
            if (!notificationDropdown.contains(e.target) && !notificationToggle.contains(e.target)) {
                notificationDropdown.classList.remove('active');
            }
        }
    });
    // --- 알림 로직 종료 ---

    // --- 도서관 검색 기능 ---
    const librarySearchInput = document.getElementById('librarySearchInput');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    if (librarySearchInput) {
        // Enter 키 누를 때 검색 실행
        librarySearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchQuery = librarySearchInput.value.trim();
                if (searchQuery) {
                    // 로딩 오버레이 메시지 변경
                    if (loadingText) {
                        loadingText.textContent = `검색하신 키워드로 고려대학교 도서관 사이트로 이동합니다.`;
                    }

                    // 로딩 오버레이 표시
                    if (loadingOverlay) {
                        loadingOverlay.classList.add('active');
                    }

                    // 1.5초 후 도서관 사이트로 이동
                    setTimeout(() => {
                        const libraryUrl = `https://library.korea.ac.kr/main-search-result/?q=${encodeURIComponent(searchQuery)}`;
                        window.open(libraryUrl, '_blank');

                        // 로딩 오버레이 숨기기 및 메시지 원래대로
                        if (loadingOverlay) {
                            loadingOverlay.classList.remove('active');
                        }
                        if (loadingText) {
                            loadingText.textContent = '이동 중입니다... 새로운 탭에서 열립니다.';
                        }

                        // 검색어 초기화
                        librarySearchInput.value = '';
                    }, 1500);
                }
            }
        });

        // 검색 아이콘 클릭 시에도 검색 실행 (선택적)
        const searchIcon = librarySearchInput.parentElement.querySelector('.fa-search');
        if (searchIcon) {
            searchIcon.style.cursor = 'pointer';
            searchIcon.addEventListener('click', () => {
                const searchQuery = librarySearchInput.value.trim();
                if (searchQuery) {
                    // Enter 키 이벤트 트리거
                    const event = new KeyboardEvent('keypress', { key: 'Enter' });
                    librarySearchInput.dispatchEvent(event);
                }
            });
        }
    }
    // --- 도서관 검색 기능 종료 ---
});