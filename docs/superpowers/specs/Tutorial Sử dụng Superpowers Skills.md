# Tutorial: Sử dụng Superpowers Skills

2026-09-22 · @Someone

## Superpowers là gì?

**Superpowers** là một hệ thống skills (kỹ năng) được cài vào Claude để nâng cao chất lượng làm việc trong các dự án phần mềm. Mỗi skill là một tập hướng dẫn chi tiết giúp Claude làm đúng việc, đúng thứ tự, không bỏ bước.

### Tại sao cần Superpowers?

Không có skills, Claude có xu hướng:

- Nhảy thẳng vào code mà không hiểu rõ yêu cầu
- Đề xuất fix bug trước khi tìm ra nguyên nhân gốc rễ
- Tuyên bố "xong" mà không chạy kiểm tra thực tế
- Viết code trước khi có test

Superpowers buộc Claude làm đúng quy trình — giống như một senior engineer kỷ luật, không phải junior hào hứng nhưng vội vàng.

### Triết lý cốt lõi

Skills phải được gọi TRƯỚC mọi hành động — kể cả câu hỏi làm rõ. Superpowers hoạt động theo nguyên tắc: quy trình đúng tạo ra kết quả đúng. Mỗi skill là một checkpoint bắt buộc, không phải gợi ý tùy chọn.

## Danh sách tất cả Skills

| Skill | Khi nào dùng |
| --- | --- |
| `using-superpowers` | Mỗi đầu conversation — thiết lập cách tìm và dùng skills |
| `brainstorming` | Trước mọi công việc sáng tạo, xây dựng tính năng, thiết kế |
| `writing-plans` | Sau brainstorming, trước khi chạm vào code — lập kế hoạch chi tiết |
| `test-driven-development` | Trước khi viết production code cho bất kỳ feature hay bugfix |
| `systematic-debugging` | Khi gặp bug, test fail, hành vi không mong muốn |
| `verification-before-completion` | Trước khi tuyên bố xong, commit, hoặc tạo PR |
| `executing-plans` | Khi thực thi kế hoạch trong session hiện tại |
| `requesting-code-review` | Khi hoàn thành task, trước khi merge |
| `receiving-code-review` | Khi nhận feedback code review |
| `finishing-a-development-branch` | Khi implementation xong, cần quyết định cách tích hợp |
| `using-git-worktrees` | Khi bắt đầu feature work cần isolation |
| `dispatching-parallel-agents` | Khi có 2+ task độc lập có thể làm song song |
| `subagent-driven-development` | Khi thực thi plan với các task độc lập |
| `diagnosing-superpowers` | Khi session đi sai hướng và cần hiểu tại sao |
| `writing-skills` | Khi tạo hoặc chỉnh sửa skills mới |

## Quy tắc vàng: Gọi Skill TRƯỚC khi hành động

Đây là quy tắc quan trọng nhất của Superpowers:

> Nếu có 1% khả năng một skill áp dụng được, bạn PHẢI gọi nó. Không có ngoại lệ.

### Thứ tự bắt buộc

1. Nhận yêu cầu
2. Xác định skill nào áp dụng
3. Đọc SKILL.md của skill đó
4. Thông báo: "Đang dùng \[skill\] để \[mục đích\]"
5. Làm theo skill chính xác
6. Chỉ sau đó mới hành động

### Ưu tiên khi nhiều Skills áp dụng

Skills về quy trình (process) luôn đến trước skills về implementation:

- Xây dựng tính năng mới → `brainstorming` trước, rồi mới implementation skills
- Fix bug → `systematic-debugging` trước, rồi mới domain skills
- Viết code → `test-driven-development` trước khi có production code

### Các dấu hiệu nguy hiểm (Red Flags)

Những suy nghĩ sau đây có nghĩa là DỪNG LẠI — bạn đang tự hợp lý hóa việc bỏ qua skill:

- "Câu hỏi này đơn giản thôi" → Câu hỏi cũng là task. Kiểm tra skills.
- "Để tôi xem codebase trước" → Skills nói cho bạn biết CÁCH xem. Check trước.
- "Skill này quá nặng cho task nhỏ này" → Task nhỏ thành phức tạp. Dùng nó đi.
- "Tôi nhớ skill này rồi" → Skills thay đổi. Đọc phiên bản hiện tại.
- "Chỉ làm một thứ này trước đã" → Check TRƯỚC khi làm bất cứ gì.

## Luồng làm việc chuẩn (Standard Workflow)

Đây là luồng đầy đủ từ khi nhận yêu cầu đến khi hoàn thành:

```
Nhận yêu cầu xây dựng tính năng
        ↓
[brainstorming] — Hiểu rõ ý định, thiết kế, lấy approval
        ↓
[writing-plans] — Viết plan chi tiết, map file, task list
        ↓
[using-git-worktrees] — Tạo isolated workspace (nếu cần)
        ↓
[test-driven-development] — Viết test trước, watch it fail
        ↓
Viết production code → pass tests
        ↓
[verification-before-completion] — Chạy lệnh, xem output thực tế
        ↓
[requesting-code-review] — Review trước khi merge
        ↓
[finishing-a-development-branch] — Quyết định cách tích hợp
```

### Khi gặp vấn đề trong luồng

- Bug xuất hiện → dừng lại, gọi `systematic-debugging` ngay
- Nhận code review → gọi `receiving-code-review` trước khi implement
- Nhiều task độc lập → cân nhắc `dispatching-parallel-agents`
- Session đi sai → gọi `diagnosing-superpowers` để phân tích

## Skill: brainstorming

**Khi nào dùng:** Trước MỌI công việc sáng tạo — tạo feature, build component, thêm chức năng, thay đổi hành vi.

### Mục đích

Biến idea thành design có cấu trúc thông qua hội thoại cộng tác. Skill này ngăn Claude nhảy thẳng vào code mà chưa hiểu rõ yêu cầu.

### Ba con đường (Three Paths)

| Path | Khi nào | Kết quả |
| --- | --- | --- |
| **Spike** | Câu hỏi kỹ thuật chưa rõ | Câu hỏi + probe nhỏ để test |
| **Bounded** | Task rõ ràng, nhỏ-trung bình | In-chat design ngắn, lấy approval |
| **Architectural** | Task lớn, nhiều hệ thống | Written spec đầy đủ, rồi plan |

### Quy trình

1. Phân loại request vào 1 trong 3 paths
2. Khám phá intent: mục tiêu là gì, ai dùng, thành công trông như thế nào
3. Viết lại hiểu biết — phân biệt điều họ nói vs giả định của bạn
4. Đề xuất design và lấy approval
5. Chỉ sau khi được approve mới tiến sang implementation

### HARD GATE

Không được viết production code, scaffold, hoặc install dependencies trước khi hoàn thành path đã chọn và được human partner approve.

### Ví dụ trigger

```
User: "Thêm dark mode cho app"
Claude: [đọc brainstorming skill]
Claude: "Đang dùng brainstorming skill để hiểu rõ yêu cầu.
         Path: Bounded (task rõ, phạm vi vừa)
         Câu hỏi: Dark mode này apply cho toàn app hay chỉ
         một số component? User có thể toggle hay follow system?"
```

## Skill: writing-plans

**Khi nào dùng:** Sau khi có spec/requirements từ brainstorming, TRƯỚC khi chạm vào code.

### Mục đích

Viết plan thực thi chi tiết đến mức một engineer không biết gì về codebase cũng có thể làm theo. Plan bao gồm file nào cần sửa, code mẫu, cách test, thứ tự commit.

### Cấu trúc một Plan tốt

1. **File Structure** — Map ra file nào tạo/sửa và trách nhiệm của mỗi file
2. **Task Decomposition** — Chia thành task nhỏ nhất có thể có test cycle riêng
3. **Testing Strategy** — TDD, regression tests, cách verify
4. **Implementation Detail** — Code đủ cụ thể để không phải đoán

### Nơi lưu plan

```
docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md
```

### Scope Check

Nếu spec bao gồm nhiều subsystem độc lập → đề xuất tách thành nhiều plan riêng. Mỗi plan phải tạo ra software có thể chạy và test độc lập.

### Ví dụ trigger

```
[Sau khi brainstorming approved spec]
Claude: "Đang dùng writing-plans skill để tạo implementation plan."
Claude: [Tạo plan ở docs/superpowers/plans/2026-09-22-dark-mode.md]
        Task 1: Tạo ThemeContext + ThemeProvider
        Task 2: Thêm toggle button vào Header
        Task 3: Cập nhật CSS variables
        ...
```

## Skill: test-driven-development

**Khi nào dùng:** Khi implement bất kỳ feature hay bugfix — TRƯỚC khi viết production code.

### Iron Law

> KHÔNG CÓ PRODUCTION CODE NẾU CHƯA CÓ FAILING TEST

Viết code trước test? Xóa nó đi. Bắt đầu lại.

### Chu kỳ Red-Green-Refactor

```
1. RED   — Viết test → chạy → PHẢI FAIL
2. GREEN — Viết code tối thiểu để test pass
3. REFACTOR — Làm sạch code, test vẫn phải pass
```

**Nếu bạn không thấy test fail, bạn không biết test có test đúng thứ không.**

### Các bước thực hiện

1. Đọc plan task hiện tại
2. Viết test mô tả behavior mong muốn
3. Chạy test — verify nó FAIL với lý do đúng
4. Viết code tối thiểu để pass
5. Chạy lại — verify PASS
6. Refactor nếu cần
7. Commit

### Ngoại lệ (phải hỏi human partner)

- Throwaway prototypes
- Generated code
- Configuration files

### Ví dụ

```typescript
// BƯỚC 1: Viết test TRƯỚC
test('formatPrice formats number with currency symbol', () => {
  expect(formatPrice(99.9)).toBe('$99.90');
  expect(formatPrice(0)).toBe('$0.00');
});

// Chạy → FAIL (formatPrice chưa tồn tại) ✓

// BƯỚC 2: Viết code tối thiểu
export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Chạy → PASS ✓
```

## Skill: systematic-debugging

**Khi nào dùng:** Khi gặp BẤT KỲ bug, test fail, hoặc hành vi không mong muốn — TRƯỚC khi đề xuất fix.

### Iron Law

> KHÔNG FIX GÌ CẢ CHO ĐẾN KHI TÌM ĐƯỢC ROOT CAUSE

Fix symptom mà không có root cause = thất bại.

### Ba Phase

**Phase 1 — Understand (BẮTBUỘC trước Phase 2)**

- Reproduce bug một cách đáng tin cậy
- Đọc error message đầy đủ, không đoán
- Xác định rõ: behavior thực tế vs mong muốn
- Map code path từ trigger đến failure

**Phase 2 — Hypothesize**

- Liệt kê 3-5 nguyên nhân có thể
- Xếp theo xác suất
- Thiết kế test để verify/falsify từng hypothesis

**Phase 3 — Fix**

- Chỉ fix sau khi đã xác định root cause
- Viết regression test trước khi fix (TDD)
- Verify fix bằng test thực tế

### Đặc biệt quan trọng khi

- Đang bị áp lực thời gian (lúc này dễ đoán mò nhất)
- "Fix rõ ràng quá" — đây thường là trap
- Đã thử nhiều fixes không được
- Không hiểu rõ vấn đề

### Ví dụ

```
Bug: Button submit không hoạt động

Sai: "Chắc là event handler bị sai. Để tôi thêm console.log."

Đúng:
  Phase 1: Reproduce → click button → không có gì xảy ra
           Read error → không có error trong console
           Code path: onClick → handleSubmit → validateForm → ...
  Phase 2: Hypotheses:
           1. handleSubmit không được gọi (check network tab)
           2. validateForm trả về false (add logging)
           3. API call fail silently (check response)
  Phase 3: [Sau khi verify] Root cause: validateForm check email
           nhưng email field chưa được trim → leading space fail
```

## Skill: verification-before-completion

**Khi nào dùng:** Trước khi tuyên bố xong, trước khi commit/push/PR, trước khi chuyển sang task tiếp theo.

### Iron Law

> KHÔNG TUYÊN BỐ XONG NẾU CHƯA CÓ BẰNG CHỨNG TỪ LỆNH CHẠY THỰC TẾ

### Gate Function — 5 bước bắt buộc

```
1. IDENTIFY  — Lệnh nào chứng minh claim này?
2. RUN       — Chạy lệnh ĐẦY ĐỦ (fresh, không cache)
3. READ      — Đọc output đầy đủ, check exit code, đếm failures
4. VERIFY    — Output có confirm claim không?
               Không → Nêu trạng thái thực tế + evidence
               Có    → Nêu claim + evidence
5. ONLY THEN — Mới được tuyên bố
```

### Bảng yêu cầu evidence

| Claim | Yêu cầu | Không đủ |
| --- | --- | --- |
| Tests pass | Output: 0 failures | Run cũ, "should pass" |
| Build thành công | Exit code 0 | Linter pass |
| Bug đã fix | Test original symptom: pass | Code đã thay đổi |
| Linter clean | Output: 0 errors | Partial check |
| Agent xong | VCS diff có changes | Agent báo "success" |

### Red Flags — DỪNG ngay

- Dùng "should", "probably", "seems to"
- Nói "Great!", "Perfect!", "Done!" trước khi verify
- Sắp commit mà chưa chạy test
- Tin vào báo cáo của agent
- Mệt và muốn xong

### Ví dụ

```bash
# SAI
"Code trông ổn rồi, chắc tests pass."

# ĐÚNG
$ npm test
✓ 34 tests passed (2.1s)
→ "Tất cả 34 tests pass. [output trên]"
```

## Các Skills bổ sung khác

### executing-plans

Dùng khi thực thi implementation plan trong session hiện tại với bạn là người thực thi. Hướng dẫn cách đọc plan, track progress, xử lý blockers và giao tiếp với human partner trong khi làm.

### requesting-code-review

Dùng khi hoàn thành task lớn hoặc feature quan trọng, trước khi merge. Skill giúp chuẩn bị code cho review: self-review checklist, mô tả thay đổi, test coverage.

### receiving-code-review

Dùng khi nhận feedback từ code review — đặc biệt khi feedback không rõ ràng hoặc có vẻ đáng ngờ về mặt kỹ thuật. Yêu cầu kiểm tra kỹ lưỡng, không implement mù quáng.

### finishing-a-development-branch

Dùng khi implementation xong và cần quyết định cách tích hợp: merge trực tiếp, squash, rebase, hay tạo PR. Kiểm tra readiness trước khi merge.

### using-git-worktrees

Dùng khi bắt đầu feature work cần isolation khỏi workspace hiện tại. Tạo worktree độc lập để có thể làm song song nhiều branch mà không conflict.

### dispatching-parallel-agents

Dùng khi có 2+ task hoàn toàn độc lập (không shared state, không sequential dependency). Có thể dispatch các subagent làm song song để tiết kiệm thời gian.

### subagent-driven-development

Dùng khi thực thi plan với nhiều task độc lập trong session hiện tại — tương tự parallel agents nhưng với cơ chế khác.

### diagnosing-superpowers

Dùng khi session đi sai: Claude làm lại việc cũ, bỏ qua plan, kết quả kém, skill không fire. Giúp phân tích nguyên nhân và tạo bug report cho maintainers.

### writing-skills

Dùng khi muốn tạo skill mới, chỉnh sửa skill hiện có, hoặc test performance của skill.

## Các lỗi thường gặp và cách tránh

### Lỗi 1: Bỏ qua skill vì tưởng task nhỏ

**Triệu chứng:** "Chỉ sửa một dòng thôi, cần gì đến brainstorming?"

**Hậu quả:** Sửa sai thứ, tạo bug mới, mất nhiều thời gian hơn.

**Cách tránh:** Nếu có 1% khả năng skill áp dụng → gọi nó. Luôn.

---

### Lỗi 2: Fix bug mà không tìm root cause

**Triệu chứng:** "Error này nhìn giống timeout, để tôi tăng timeout lên."

**Hậu quả:** Bug vẫn còn đó dưới dạng khác, hoặc fix tạo ra bug mới.

**Cách tránh:** Gọi `systematic-debugging`, làm Phase 1 xong xuôi trước khi đề xuất fix.

---

### Lỗi 3: Tuyên bố xong mà không verify

**Triệu chứng:** "Code trông ổn, tests chắc pass thôi."

**Hậu quả:** Commit code broken, discovery muộn khi đã merge.

**Cách tránh:** Luôn chạy lệnh verify và đưa output thực tế vào claim.

---

### Lỗi 4: Viết code trước test

**Triệu chứng:** "Để tôi implement feature trước rồi viết test sau cho nhanh."

**Hậu quả:** Test chỉ verify code đã viết thay vì verify behavior đúng. Bugs ẩn.

**Cách tránh:** Gọi `test-driven-development`, viết test fail trước — không ngoại lệ.

---

### Lỗi 5: Implement mà không có plan

**Triệu chứng:** "Requirement rõ rồi, code luôn đi."

**Hậu quả:** Halfway qua mới phát hiện architecture sai, phải làm lại.

**Cách tránh:** `brainstorming` → `writing-plans` → implementation. Không rút ngắn.

## Quick Reference — Skills theo tình huống

| Tình huống | Skill cần gọi |
| --- | --- |
| Bắt đầu conversation mới | `using-superpowers` |
| "Hãy xây dựng tính năng X" | `brainstorming` → `writing-plans` → `test-driven-development` |
| "Fix bug này cho tôi" | `systematic-debugging` → `test-driven-development` → `verification-before-completion` |
| "Viết code cho..." | `test-driven-development` |
| "Implement plan này" | `executing-plans` |
| Sắp commit / tạo PR | `verification-before-completion` → `requesting-code-review` |
| Nhận code review feedback | `receiving-code-review` |
| Merge branch | `finishing-a-development-branch` |
| Feature cần isolation | `using-git-worktrees` |
| 3+ task độc lập | `dispatching-parallel-agents` |
| Session đi lạc / kết quả kém | `diagnosing-superpowers` |
| Muốn tạo skill mới | `writing-skills` |

### Câu hỏi kiểm tra nhanh

Trước mỗi hành động, hỏi:

1. Có skill nào áp dụng cho việc này không?
2. Tôi đã đọc SKILL.md của nó chưa?
3. Tôi đã thông báo "Đang dùng \[skill\] để \[mục đích\]" chưa?
4. Tôi có đang đi đúng thứ tự của skill không?

Nếu câu trả lời nào là "Không" → DỪNG, làm từ bước 1.
