# FacialFeatures 候选片与红板排序导出（`assets/pdt/<key>_features.json`）

演示页「分析」一章里的五官搜索区、得分最高的片、支撑候选点，改为直接读 Grasshopper 组件
`FacialFeatures` 在 `goggles_final.gh` 里**真实**算出的结果，不再由网页 JS 重算。
每张压力图一份：`female` / `mean` / `male` / `p20` / `p15`，共 5 个文件。

## 文件格式

```
{
 "key": "female",                 // 压力图键，同 pdt_maps.json 的 order
 "label": "Female mean",
 "source": "...",                 // 来源：无界面 Rhino 8 跑 goggles_final.gh，变体 pos-mid__den-mid
 "vertex_count": 10152,
 "vertex_order": "...",           // 顶点顺序说明（见下）
 "cut_z": -82,                    // UseCut=True，CutPln 是 z=-82 的水平面；z<-82 的顶点不参与
 "valid_count": N,                // 切掉后剩下的顶点数（= z >= -82 的顶点数）
 "head_bbox": [[x,y,z],[x,y,z]],  // 切掉后头网格的包围盒（uvw_head 的归一化基准）
 "face_bbox": [[x,y,z],[x,y,z]],  // 脸部包围盒（uvw_face 的归一化基准，眼睛搜索用）
 "face_idxs": [...],              // 脸部顶点集 face_idxs（眼睛只在这个集合里找）
 "features": {                    // 各特征的候选片 = 源码 main 里的 *_top 列表，顺序就是组件内部排序
  "nose": [...],                  // nose_top   按 Y 最小（最靠前）排
  "left_eye": [...],              // le_top     按 uvw_face 的 v 从大到小（最凹）排
  "right_eye": [...],             // re_top
  "left_ear": [...],              // lear_top   按法线复杂度从高到低排，再按 z 带筛成 pool
  "right_ear": [...],             // rear_top
  "back": [...],                  // anchor_top 按法线与 (0,1,0.65) 的对齐度排
  "chin": [...],                  // chin_top   按 凸度/颜色/高度 打分排
  "left_cheek": [...],            // lcheek_top 按 凸度/颜色/u 距 打分排
  "right_cheek": [...]            // rcheek_top
 },
 "best": {"nose": i, ...},        // 各特征最终选中的顶点索引（i_nose, i_le, ...）
 "points": {"nose": [x,y,z], ..., "back_lower": [x,y,z]},   // 对应输出口 PtNose / PtLEye / ... 的坐标（核对用）
 "conf": {...},                   // 组件 Conf 输出
 "red_plates": {                  // 该变体（COUNT 6 / MIN_DIST 90）实际选出的红板点
  "variant": "pos-mid__den-mid", "count": 6, "min_dist": 90.0,
  "idxs": [...], "points": [[x,y,z], ...]
 },
 "red_rank": {                    // 支撑候选点排序：三种高度偏好各取打分前 5% 的顶点索引，从高到低
  "score": "...", "top_fraction": 0.05,
  "params": {"low": {"target": 0.50, "bias": 0.60}, "mid": {"target": 0.62, "bias": 0.00}, "high": {"target": 0.92, "bias": 0.60}},
  "low": [...], "mid": [...], "high": [...]
 }
}
```

左右以头网格自身的 X 轴为准（`left_*` 是 X 负侧，和组件输出口 PtLEye / PtLEar 的叫法一致）。

### red_rank 的打分公式

```
redness(i) = R - (G + B) / 2            # 顶点色用 GH 实际喂给组件的合成图（head_maps.json 的 colors），不是网页展示色
w(i)       = (z - zmin) / (zmax - zmin)  # 切掉 z<-82 之后的头包围盒归一化高度，clamp 到 [0,1]
score(i)   = redness(i) + BIAS * 255 * (1 - |w(i) - TARGET|)
```

与 `variants_heads.json` 里 pos-low / pos-mid / pos-high 三组变体注入的 `code_patches` 一致：
low 用 TARGET 0.50 / BIAS 0.60，mid 用 BIAS 0（纯红度），high 用 TARGET 0.92 / BIAS 0.60。
只在有效集（z >= -82）内打分，取前 5%（四舍五入）。分数并列时的顺序以 GH 的 `list.sort` 为准。

## 顶点索引与网页头网格的对应

所有索引都指 gh 内嵌头网格的 10,152 个顶点。已核对：

- `head_dump.json`（gh 内嵌头网格导出）与 `assets/head.glb` 顶点数相同（10,152），逐索引坐标差最大 0.0009 mm；
- `head_glb_map.json` 的 `gh_to_glb` 是恒等映射；
- `assets/pdt/<key>_head.bin` 由 `prep_pdt_colors.py` 按 `head.glb` 的顶点顺序写出。

所以 `features.*`、`face_idxs`、`red_rank.*`、`best.*` 的索引可直接当作 `head.glb` / `<key>_head.bin` 的顶点下标，不需要映射。
`build_features.py` 在整理时还逐个核对了 `best` 索引处 `head_dump` 的坐标等于 `points` 坐标。

### 展示色 vs 管线色

`<key>_head.bin` 存的是网页**展示**色（`head_maps.json` 的 `display_colors`，整张图）。
GH 里 FacialFeatures 拿到的是**合成**色（`colors`：脸部 y < -60 用女性均值图覆盖，其余按各图）。
female 两者相同；mean / male / p20 / p15 约 2,519 个脸部顶点不同。`red_rank` 按合成色算，
所以网页若自己用展示色重算红度，脸部结果会和这里不一致，这正是要直接读这份 JSON 的原因。

## 生成方法

1. 在 scratchpad 复制 `gh_variant_batch.py` 和 `run_batch_wrapper.py`，把 `HERE` 指到工作目录（原件不动）。
2. 用 `make_cfg.py` 生成批跑配置 `variants_features.json`：
   - 只跑一个变体 `pos-mid__den-mid`（RED_PLATE_COUNT 6 / MIN_DIST 90，TARGET 0.62 / BIAS 0），
     `head_maps` 列 5 张图 → 共 5 次求解；
   - `constants` 里把 `PARAM_DEBUG` 设为 `True`；
   - `code_patches`（逐变体正则补丁，因为批跑脚本每个变体都会把 base_code 重新 SetSource，
     `component_patches` 对 FacialFeatures 会被覆盖）：
     `import math` 后加 `import json`；把 `Debug = {"valid_points": ...}` 整段换成
     `Debug = json.dumps({...})`，内容就是上面的字段（索引全部 `int()`，点转 `[x,y,z]`），
     并在组件内按三组 TARGET / BIAS 复算 red_rank；
   - `texts` 加 `{"key": "features", "nick": "FacialFeatures", "out": "Debug"}`；
     `final_component_type` 设成不存在的名字，不写 STL；
   - 同时保留 `points`（PtNose 等）用于交叉核对。
3. PowerShell 启动无界面 Rhino 8：
   `Start-Process 'C:\Program Files\Rhino 8\System\Rhino.exe' -ArgumentList ('/nosplash /notemplate /runscript="_-RunPythonScript ' + $wrapper + '"')`
   （整条 runscript 作为一个字符串参数；不保存 gh）。
4. `build_features.py` 读 `head-<key>__pos-mid__den-mid.json`，写 5 个 `<key>_features.json`，并核对：
   索引数量下限、`points` 与 `assets/variants/manifest.json` 里 `head-<key>__pos-mid__den-mid` 的
   `anchor_*` / `red_plates` 一致、`valid_idxs` 等于 `{z >= -82}`、numpy 按同一公式复算的
   red_rank 与 GH 结果一致。

补丁后的组件源码预览、配置、脚本和核对日志见 scratchpad
`C:\Users\cloud\AppData\Local\Temp\claude\D--School-portfolio\62965893-0e5f-452d-aa57-ddb1344ba454\scratchpad\features\`。

## 2026-10-25 这一轮的结果

5 张图各求解一次（38–57 s），FacialFeatures 本身 0 错误（mean / male / p20 的 3 个错误来自下游
TriRemesh / Loft / AliCrvSeams，与之前出 manifest 的那轮一样，不影响本组件输出）。
`build_features.py` 核对 0 问题。每个文件约 18 KB。

| 特征 | 索引数（5 张图相同） | 备注 |
|---|---|---|
| nose | 12 | 只看几何，5 张图完全相同 |
| left_eye / right_eye | 30 / 30 | 同上 |
| left_ear / right_ear | 29 / 28 | 同上（这是 z 带筛过的 pool） |
| back | 156 | 同上 |
| chin | 20 | 用到颜色，但下巴在合成图统一取女性均值的脸部区，5 张图相同 |
| left_cheek / right_cheek | 20 / 20 | 用到颜色，female / p15 各自一套，mean / male / p20 三张相同 |
| face_idxs | 1,758 | 5 张图相同 |
| valid（z >= −82） | 8,048 | 5 张图相同 |
| red_rank low / mid / high | 各 402（= 8,048 × 5%） | 每张图不同 |

- `points` 里 9 个特征点 + 2 个颊点 + 6 个红板点，全部与 `manifest.json` 的
  `head-<key>__pos-mid__den-mid` 对应项一致（误差 ≤ 0.01 mm，manifest 存 2 位小数）。
- numpy 复算的 red_rank 与 GH 的**集合**逐张逐档完全相同；其中 7 档（female high、mean low、
  male low / high、p15 low 等）内部顺序有少量差异，原因是浮点并列分数下 `list.sort` 与
  `np.argsort` 的并列处理不同，文件里存的是 GH 的顺序。
- 各图 `red_plates`（COUNT 6 / MIN_DIST 90 实际选出的 6 个支撑点）：
  female `[72, 85, 1656, 1555, 3251, 7006]`，mean `[5123, 1682, 1020, 522, 3, 2058]`，
  male `[5123, 8965, 546, 6658, 8756, 2081]`，p20 `[314, 4347, 9415, 5040, 1169, 4973]`，
  p15 `[1023, 2864, 2894, 635, 1598, 2723]`；每组第一个都是该图 `red_rank.mid` 的第一名。
