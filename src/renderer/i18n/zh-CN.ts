import { ASSET_LABELS } from './asset-labels'
import { MOTION_LABELS } from './motion-labels'
import { PRESET_LABELS } from './preset-labels'

/**
 * Fixed Simplified Chinese display vocabulary for built-in engine metadata.
 * Apply only at UI boundaries: do not translate IDs, user names or AI prompts.
 * Exact matching keeps unknown/custom metadata intact without token replacement.
 */
const LABELS: Readonly<Record<string, string>> = {
  ...ASSET_LABELS,
  ...MOTION_LABELS,
  ...PRESET_LABELS,

  // Asset categories, including enum values used as dropdown headings.
  People: '人物',
  people: '人物',
  Animals: '动物',
  animals: '动物',
  Vehicles: '交通工具',
  vehicles: '交通工具',
  Furniture: '家具',
  furniture: '家具',
  Props: '道具',
  props: '道具',
  Environments: '环境',
  environment: '环境',
  Primitives: '基础几何体',
  primitives: '基础几何体',
  custom: '自定义',

  // Motion/action/camera categories. Their underlying enum values stay English.
  fight: '打斗',
  dance: '舞蹈',
  chase: '追逐',
  footChase: '徒步追逐',
  carChase: '汽车追逐',
  gesture: '手势',
  everyday: '日常动作',
  sport: '运动',
  stunt: '特技',
  aircraft: '飞机',
  helicopter: '直升机',
  bird: '鸟类',
  vehicle: '车辆与船只',
  destruction: '破坏',
  object: '物体',
  person: '人物',
  animal: '动物',
  'push & pull': '推近与拉远',
  'orbit & arc': '环绕与弧线',
  'crane & boom': '升降与摇臂',
  aerial: '航拍',
  follow: '跟拍',
  'pan & scan': '摇镜与巡视',
  stylized: '风格化',

  // Movement gaits.
  Stand: '站立',
  Walk: '行走',
  Jog: '慢跑',
  Run: '奔跑',
  Sit: '坐姿',
  'Lie down': '躺卧',
  Crouch: '蹲姿',
  'Talk / gesture': '说话／手势',
  Fall: '倒地',

  // Camera equipment and optics.
  'Sticks (locked off)': '三脚架（固定机位）',
  Dolly: '轨道车',
  Steadicam: '斯坦尼康',
  Handheld: '手持',
  'Crane / Jib': '吊臂／摇臂',
  Drone: '无人机',
  'Car mount': '车载支架',
  'Tripod. No movement noise; pans/tilts between marks only.': '三脚架固定机位，没有运动抖动，仅在标记间横摇或俯仰。',
  'Rail-smooth tracking with near-imperceptible weight.': '如轨道般平滑跟拍，带有几乎不可察觉的运动惯性。',
  'Floating glide with a gentle low-frequency drift.': '轻盈滑行，伴随柔和的低频漂移。',
  'Operator energy. Intensity slider goes doc-style to Bourne.': '模拟摄影师手持运动，强度可从纪录片式轻晃调至《谍影重重》式剧烈晃动。',
  'Sweeping arcs; slight boom settle.': '大幅弧线运动，带有轻微摇臂回稳。',
  'Large-scale smooth flight with mild aerial drift.': '大范围平滑飞行，伴随轻微空中漂移。',
  'Parented to a vehicle or actor; road vibration.': '绑定到车辆或人物，模拟路面振动。',
  'Super 16': '超 16 毫米（Super 16）',
  'Super 35': '超 35 毫米（Super 35）',
  'Full Frame / VistaVision': '全画幅／VistaVision',
  '65mm / IMAX': '65 毫米／IMAX',
  'Extreme Wide': '大远景',
  Wide: '远景',
  'Full Shot': '全景',
  Medium: '中景',
  'Medium Close-Up': '近景',
  'Close-Up': '特写',
  'Extreme Close-Up': '大特写',
  Height: '高度',
  Pan: '横摇',
  Tilt: '俯仰',
  Roll: '横滚',
  Lens: '焦距',
  'At time': '时间',

  // Group sequences and choreography styles, formations and endings.
  'Mixed styles': '混合风格',
  'Paired brawl': '成对打斗',
  'Mob vs one': '多人围攻一人',
  'Straight pursuit': '直线追逐',
  Weaving: '左右穿行',
  Mixed: '混合',
  'Hip-hop': '嘻哈',
  Party: '派对舞',
  Latin: '拉丁舞',
  Robot: '机械舞',
  Brawl: '混战',
  'Martial arts': '武术',
  Sparring: '对练',
  'Foot chase': '徒步追逐',
  'Finish (loser stays down)': '终结（败者保持倒地）',
  'Sparring (loser gets up)': '对练（败者起身）',
  Caught: '被追上',
  Escape: '逃脱',
  'Freeze pose': '定格造型',
  Line: '一字队形',
  'Two rows': '双排队形',
  'V-shape': 'V 字队形',
  Diamond: '菱形队形',
  Circle: '圆形队形',

  // Instructions displayed beside built-in generator profiles.
  'Attach the reference MP4 as the motion/video reference and the first-frame still as the image reference.': '将参考 MP4 作为动作／视频参考，将首帧静帧作为图像参考。',
  'Use the first-frame still as the image input; describe the camera move in the prompt.': '将首帧静帧用作图像输入，并在提示词中描述摄影机运动。',
  'Use first-frame and last-frame stills as start/end frames; the reference video guides motion where supported.': '将首帧和末帧静帧作为起始帧／结束帧；支持时使用参考视频引导运动。',
  'Use the depth-pass MP4 as a depth/structure conditioning video (ComfyUI workflow included in the export).': '将深度通道 MP4 作为深度／结构控制视频，导出包中包含 ComfyUI 工作流。',
  'Use the depth or reference video as VACE/control input in ComfyUI (workflow included in the export).': '在 ComfyUI 中将深度或参考视频作为 VACE／控制输入，导出包中包含工作流。',
  'Attach the mark stills and top-down diagram as image references for composition.': '将标记静帧和俯视图作为构图参考图像。',
  'Attach a mark still as the composition reference.': '将一张标记静帧作为构图参考。',
  'Attach a mark still as a style/composition reference.': '将一张标记静帧作为风格／构图参考。',
  'Use a mark still as the image reference with high adherence strength.': '将一张标记静帧作为图像参考，并使用较高的参考遵循强度。'
}

export function zh(text: string): string {
  return Object.prototype.hasOwnProperty.call(LABELS, text) ? LABELS[text]! : text
}
