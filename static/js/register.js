// Register page JavaScript
// [새로운 접근법] 숨겨진 textarea에서 JSON 문자열을 가져와 JSON.parse()로 변환합니다.
const collegeJsonString = document.getElementById('college-data-json').value;
let COLLEGE_DEPARTMENTS = {};

try {
    COLLEGE_DEPARTMENTS = JSON.parse(collegeJsonString);
} catch (e) {
    console.error("단과대학/학과 데이터 파싱 오류:", e);
    // 파싱 오류 발생 시 콘솔에 기록하고 빈 객체 유지
}

function updateDepartments() {
    const collegeSelect = document.getElementById('college');
    const deptSelect = document.getElementById('department');
    const selectedCollege = collegeSelect.value;

    deptSelect.innerHTML = '<option value="" disabled selected>학과 선택</option>';

    if (selectedCollege && COLLEGE_DEPARTMENTS[selectedCollege]) {
        COLLEGE_DEPARTMENTS[selectedCollege].forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            deptSelect.appendChild(option);
        });
    }
}

// 페이지 로드 시 이미 선택된 단과대학이 있다면 학과 목록 초기화
if(document.getElementById('college').value) {
    updateDepartments();
}
