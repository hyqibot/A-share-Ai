# 版本更新日志 - 2025-11-24，**版本**: v1.08  

温馨提示：

1、启动方法很简单：傻瓜式，无需python基础 下载Releases安装包，解压，将user_config.json.example重命名为user_config.json，填写参数 需要用到的参数有几类：1）真实交易账户的安装路径、账号，可接入专业交易api（另询官邮），兼容各大券商的QMT和同花顺交易；2）自选股票池通达信本地路径；3）deepseek等大模型api-key；4）licence：hyqibot 填好参数保存，右键以管理员身份运行解压好的exe文件，图形界面上点击启动交易即可。

2\使用前请先下载所有A股的3年1期财务数据（使用exe程序的UI界面），下载所有a股的通达信历史日线数据（使用你本地的通达信），实时行情数据实时加载无需下载。

3\如您设置的交易端参数是同花顺，并且使用的是远程服务器的话，断开远程桌面连接必须使用软件包中的bat文件，否则会影响下单。

4\**输入多条反馈命令的方法：**

如果需要在交互控制的输入命令框中输入多条反馈命令，可以分次输入，每输入完一条命令后按回车键提交。例如：

```
feedback deepseek 加油，我看好你
[按回车键提交]
feedback 幻银超i 不要选上一轮选择过的品种，不允许再选000559
[按回车键提交]
```

系统会依次处理每条命令。

结束输入后，用户可以输入"continue"或直接按回车来明确表示继续下一轮交易。

- `pause [分钟数]` - 暂停指定分钟数再继续
- `exit` - 退出交易系统

----------------------------------------------------------------

## 📋 V1.02版更新概览

本次更新主要包含五个方面的改进：
1. **财务数据下载稳定性优化** - 修复批量下载卡住和提前结束的问题
2. **AI风格进化持久化方案** - 实现风格进化数据的数据库持久化存储
3. **超时控制机制增强** - 添加任务级别的超时控制，防止程序卡死
4. **持仓记录恢复功能** - 系统重启后自动从数据库恢复持仓和资金状态
5. **投资风格系统完善** - 新增投资风格定义模块，支持30种投资风格类型

---

## 🔧 详细更新内容

### 1. 财务数据下载稳定性优化

#### 1.1 修复循环提前退出问题

**文件**: `tools/generate_financial_data.py`

**问题描述**:
- `as_completed` 循环设置了 `timeout=120` 参数
- 在处理5450只股票时，如果120秒内没有新任务完成，循环会提前退出
- 导致只处理了200只股票就结束，剩余5250只股票未处理

**解决方案**:
- 移除了 `as_completed(future_to_code, timeout=120)` 中的超时参数
- 改为 `as_completed(future_to_code)` 等待所有任务完成
- 确保所有股票都能被处理完成

**代码变更**:
```python
# 修改前
for future in as_completed(future_to_code, timeout=120):

# 修改后
for future in as_completed(future_to_code):
```

---

#### 1.2 添加任务级超时控制

**文件**: `tools/generate_financial_data.py`

**问题描述**:
- `download_and_process_stock` 函数中的超时检查是在函数执行后进行的
- 如果 `_get_financial_indicators_cached` 内部调用东方财富接口时网络请求卡住（没有设置超时），函数会一直阻塞
- `as_completed` 循环会一直等待所有任务完成，导致程序卡住不动

**解决方案**:
- 在 `as_completed` 循环中对 `future.result(timeout=180)` 添加超时参数
- 真正实现超时控制：即使任务卡住，也会在180秒后超时并跳过
- 捕获 `FuturesTimeoutError`，记录超时并继续处理下一个任务

**代码变更**:
```python
# 新增导入
from concurrent.futures import TimeoutError as FuturesTimeoutError

# 修改循环处理逻辑
task_timeout = 180  # 每个任务最多180秒
for future in as_completed(future_to_code):
    completed_count += 1
    code = future_to_code.get(future, '未知')
    try:
        # 对future.result()添加超时，真正实现超时控制
        code, simplified_data = future.result(timeout=task_timeout)
        # ... 处理逻辑
    except FuturesTimeoutError:
        print(f"⏱️ {code} 处理超时（>{task_timeout}秒），跳过")
        failed_count += 1
        future.cancel()  # 尝试取消任务
```

**效果**:
- 即使某些股票的数据获取卡住，程序也会在180秒后跳过并继续处理
- 确保循环能正常结束，输出最终统计信息
- 避免程序无限期等待

---

### 2. AI风格进化持久化方案

#### 2.1 数据库表结构扩展

**文件**: `data_persistence.py`

**新增表结构**:

1. **风格进化历史表** (`style_evolution`):
```sql
CREATE TABLE IF NOT EXISTS style_evolution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    model_name TEXT NOT NULL,
    trading_cycle INTEGER NOT NULL,
    from_style TEXT NOT NULL,
    to_style TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
)
```

2. **AI人格数据表** (`persona_data`):
```sql
CREATE TABLE IF NOT EXISTS persona_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL UNIQUE,
    current_style TEXT NOT NULL,
    style_confidence REAL DEFAULT 0.0,
    risk_tolerance TEXT DEFAULT 'medium',
    performance_by_style TEXT,
    strategy_preferences TEXT,
    market_views TEXT,
    updated_at TEXT NOT NULL
)
```

**新增索引**:
- `idx_style_timestamp` - 优化按时间查询
- `idx_style_model` - 优化按模型查询
- `idx_style_cycle` - 优化按交易周期查询

---

#### 2.2 新增保存方法

**文件**: `data_persistence.py`

**方法1**: `save_style_evolution()`
- 保存风格进化记录到数据库
- 参数：`model_name`, `trading_cycle`, `from_style`, `to_style`, `reason`
- 自动记录时间戳和进化原因（JSON格式）

**方法2**: `save_persona_data()`
- 保存AI人格数据到数据库（当前风格、风险偏好、表现统计等）
- 参数：`model_name`, `persona_data` (字典)
- 使用 `INSERT OR REPLACE` 确保每个模型只有一条记录
- 自动将复杂数据（字典、列表）转换为JSON字符串存储

**代码示例**:
```python
def save_style_evolution(self, model_name: str, trading_cycle: int, 
                        from_style: str, to_style: str, reason: List[str] = None):
    """保存风格进化数据到数据库"""
    # ... 实现细节

def save_persona_data(self, model_name: str, persona_data: Dict):
    """保存AI人格数据到数据库"""
    # ... 实现细节
```

---

#### 2.3 新增加载方法

**文件**: `data_persistence.py`

**方法1**: `load_style_evolution()`
- 从数据库加载风格进化历史
- 参数：`model_name`, `limit=100`（最多加载100条记录）
- 按交易周期降序排列，返回最新的进化记录

**方法2**: `load_persona_data()`
- 从数据库加载AI人格数据
- 参数：`model_name`
- 自动将JSON字符串还原为字典/列表格式
- 如果不存在则返回 `None`

**代码示例**:
```python
def load_style_evolution(self, model_name: str, limit: int = 100) -> List[Dict]:
    """从数据库加载风格进化历史"""
    # ... 实现细节

def load_persona_data(self, model_name: str) -> Optional[Dict]:
    """从数据库加载AI人格数据"""
    # ... 实现细节
```

---

#### 2.4 集成到交易引擎

**文件**: `ai_trading_engine.py`

**变更1**: 风格进化时自动保存

在 `review_and_evolve_strategies()` 方法中：
- 当风格发生变化时，自动调用 `save_style_evolution()` 保存进化记录
- 每次策略回顾完成后，自动调用 `save_persona_data()` 保存当前人格状态
- 确保风格进化历史完整记录

**代码变更**:
```python
if new_style != old_style:
    persona.current_style = new_style
    evolution_record = {
        'cycle': self.trading_cycle,
        'from_style': old_style,
        'to_style': new_style,
        'reason': evolution_data.get("key_learnings", [])
    }
    perf.style_evolution.append(evolution_record)
    
    # 保存风格进化数据到数据库
    if self.data_persistence:
        self.data_persistence.save_style_evolution(
            model_name=model_name,
            trading_cycle=self.trading_cycle,
            from_style=old_style,
            to_style=new_style,
            reason=evolution_data.get("key_learnings", [])
        )

# 保存AI人格数据到数据库
if self.data_persistence:
    persona_data = {
        'current_style': persona.current_style,
        'style_confidence': persona.style_confidence,
        'risk_tolerance': persona.risk_tolerance,
        # ... 其他字段
    }
    self.data_persistence.save_persona_data(model_name, persona_data)
```

**变更2**: 启动时自动加载历史数据

新增 `_load_style_evolution_history()` 方法：
- 在 `__init__()` 中调用，程序启动时自动执行
- 加载每个模型的历史风格进化记录到 `ModelPerformance.style_evolution`
- 恢复每个模型的AI人格状态（当前风格、风险偏好等）
- 输出加载日志，显示恢复的状态信息

**代码示例**:
```python
def _load_style_evolution_history(self):
    """从数据库加载历史风格进化数据"""
    if not self.data_persistence:
        return
    
    for model_name in self.valid_models:
        # 加载AI人格数据
        persona_data = self.data_persistence.load_persona_data(model_name)
        if persona_data:
            persona.current_style = persona_data.get('current_style')
            persona.risk_tolerance = persona_data.get('risk_tolerance')
            # ... 恢复其他字段
        
        # 加载风格进化历史
        evolution_history = self.data_persistence.load_style_evolution(model_name)
        if evolution_history:
            perf.style_evolution = evolution_history
```

---

### 3. 持仓记录恢复功能

#### 3.1 功能概述

**文件**: `ai_trading_engine.py`

**方法**: `_load_positions_from_database()`

**调用位置**: `AStockAITrader.__init__()` (第506行)

系统停止再重启后，能够自动从数据库读取之前的交易记录，计算并恢复每个模型的持仓和可用资金状态。

#### 3.2 核心实现

**位置**: `ai_trading_engine.py:555-646`

**实现步骤**:

1. **初始化数据查询管理器**
   - 使用 `DataQuery` 类从数据库查询交易记录
   - 设置默认手续费率 `0.001` (0.1%)

2. **遍历所有有效模型**
   - 对每个模型单独恢复持仓状态
   - 如果模型没有交易记录，使用初始值

3. **获取交易历史记录**
   - 从数据库查询指定模型的所有交易记录（最多10000条）
   - 如果没有交易记录，跳过该模型

4. **从交易记录计算持仓和资金**
   - **买入操作** (`BUY`):
     - 计算成本：`价格 × 数量 × (1 + 手续费率)`
     - 累计买入成本
     - 增加持仓数量
   - **卖出操作** (`SELL`):
     - 计算收益：`价格 × 数量 × (1 - 手续费率)`
     - 累计卖出收益
     - 减少持仓数量（使用 `max(0, ...)` 确保不为负数）

5. **过滤并计算最终状态**
   - 过滤掉数量为0的持仓
   - 计算可用资金：`初始资金 - 买入成本 + 卖出收益`
   - 确保可用资金不为负数

6. **更新 ModelPerformance 对象**
   - `current_positions`: 当前持仓
   - `available_cash`: 可用资金
   - `buy_counts`: 买入数量统计
   - `sell_counts`: 卖出数量统计
   - `total_trades`: 交易次数

7. **输出详细日志**
   - 显示持仓数量、持仓股票、可用资金
   - 显示初始资金、投入成本、回收收益、交易次数

**代码示例**:
```python
def _load_positions_from_database(self):
    """从数据库加载持仓和可用资金（如果存在交易记录）"""
    try:
        from data_query import DataQuery
        data_query = DataQuery()
        fee_rate = 0.001
        
        for model_name in self.valid_models:
            if model_name not in self.performance:
                continue
            
            perf = self.performance[model_name]
            trades = data_query.get_trade_history(model_name=model_name, limit=10000)
            
            if not trades:
                continue
            
            # 从交易记录计算持仓和可用资金
            current_positions = {}
            total_buy_cost = 0.0
            total_sell_proceed = 0.0
            
            for trade in trades:
                symbol = trade['symbol']
                action = trade['action']
                amount = trade.get('amount') or 0
                price = trade.get('price') or 0.0
                trade_fee_rate = trade.get('fee_rate') or fee_rate
                
                if action == 'BUY':
                    trade_cost = price * amount * (1 + trade_fee_rate)
                    total_buy_cost += trade_cost
                    current_positions[symbol] = current_positions.get(symbol, 0) + amount
                elif action == 'SELL':
                    trade_proceed = price * amount * (1 - trade_fee_rate)
                    total_sell_proceed += trade_proceed
                    current_positions[symbol] = max(0, current_positions.get(symbol, 0) - amount)
            
            # 过滤空持仓
            current_positions = {k: v for k, v in current_positions.items() if v > 0}
            
            # 计算可用资金
            available_cash = perf.initial_capital - total_buy_cost + total_sell_proceed
            available_cash = max(0.0, round(available_cash, 2))
            
            # 更新 ModelPerformance 对象
            perf.current_positions = current_positions
            perf.available_cash = available_cash
            perf.total_trades = len(trades)
            
            logger.info(f"📊 {model_name} 从数据库加载持仓成功:")
            # ... 详细日志输出
            
    except Exception as e:
        logger.warning(f"从数据库加载持仓失败: {e}，将使用初始持仓和资金")
```

#### 3.3 功能特性

**自动恢复**:
- ✅ 程序启动时自动执行
- ✅ 无需手动干预
- ✅ 自动计算持仓和资金状态

**精确计算**:
- ✅ 考虑手续费（买入：1+费率，卖出：1-费率）
- ✅ 从交易记录逐条计算，确保准确性
- ✅ 处理边界情况（持仓不为负数，资金不为负数）

**完整性**:
- ✅ 恢复持仓（`current_positions`）
- ✅ 恢复可用资金（`available_cash`）
- ✅ 恢复买入/卖出统计（`buy_counts`, `sell_counts`）
- ✅ 恢复交易次数（`total_trades`）

**日志记录**:
- ✅ 详细输出恢复的持仓信息
- ✅ 显示可用资金、初始资金、投入成本、回收收益
- ✅ 异常时输出警告日志

#### 3.4 使用示例

**启动日志示例**:
```
✅ 数据持久化模块已初始化
📊 幻银超i 从数据库加载持仓成功:
   持仓数量: 3 只
   持仓股票: ['000001', '600000', '000002']
     000001: 100 股
     600000: 200 股
     000002: 150 股
   可用资金: 87500.50 元
   初始资金: 100000.00 元
   已投入成本: 25000.30 元
   已回收收益: 12500.80 元
   交易次数: 15 次
```

#### 3.5 数据流程

```
程序启动
  ↓
初始化 DataPersistence
  ↓
调用 _load_positions_from_database()
  ↓
对每个模型：
  ├─ 查询交易历史记录（最多10000条）
  ├─ 遍历每条记录
  │   ├─ BUY: 累计买入成本，增加持仓
  │   └─ SELL: 累计卖出收益，减少持仓
  ├─ 过滤空持仓
  ├─ 计算可用资金
  └─ 更新 ModelPerformance 对象
  ↓
输出详细日志
  ↓
继续其他初始化步骤
```

#### 3.6 注意事项

1. **手续费计算**:
   - 默认手续费率：`0.001` (0.1%)
   - 可以从交易记录中读取实际的 `fee_rate`
   - 买入成本：`价格 × 数量 × (1 + 手续费率)`
   - 卖出收益：`价格 × 数量 × (1 - 手续费率)`

2. **交易记录顺序**:
   - 数据库查询按时间倒序（`ORDER BY timestamp DESC`）
   - 计算时无论顺序如何，结果都是正确的（因为只是累加）

3. **边界处理**:
   - 持仓数量：使用 `max(0, ...)` 确保不为负数
   - 可用资金：使用 `max(0.0, ...)` 确保不为负数
   - 过滤空持仓：只保留数量 > 0 的持仓

4. **异常处理**:
   - 如果加载失败，使用初始值（初始资金，空持仓）
   - 不会影响程序启动

5. **性能考虑**:
   - 每个模型最多加载10000条交易记录
   - 计算过程是线性的，时间复杂度：O(n)

#### 3.7 相关代码位置

- **主实现**: `ai_trading_engine.py:555-646`
- **调用位置**: `ai_trading_engine.py:506`
- **数据查询**: `data_query.py:25-82`
- **数据保存**: `data_persistence.py:134-168`
- **数据库表**: `data_persistence.py:34-50`

---

## ✨ 功能特性

### 1. 自动持久化
- ✅ 风格进化时自动保存到数据库
- ✅ 策略回顾完成后自动更新人格数据
- ✅ 无需手动干预，完全自动化

### 2. 自动恢复
- ✅ 程序重启后自动加载历史数据
- ✅ 恢复AI人格状态（风格、风险偏好等）
- ✅ 恢复风格进化历史记录
- ✅ 恢复持仓和资金状态（从交易记录计算）

### 3. 数据完整性
- ✅ 保存完整的进化记录（周期、从风格、到风格、原因）
- ✅ 保存完整的人格数据（风格、置信度、风险偏好、表现统计等）
- ✅ 支持JSON格式存储复杂数据结构

### 4. 性能优化
- ✅ 添加数据库索引，优化查询性能
- ✅ 支持按模型、时间、周期查询
- ✅ 限制加载数量，避免内存溢出

---

## 🐛 问题修复

### 修复1: 财务数据下载只处理200只股票就结束
- **问题**: 循环提前退出，剩余股票未处理
- **原因**: `as_completed` 设置了120秒超时
- **解决**: 移除超时参数，等待所有任务完成
- **影响**: 确保所有股票都能被处理

### 修复2: 财务数据下载卡住不动
- **问题**: 某些股票数据获取卡住，程序无限等待
- **原因**: 网络请求没有设置超时，函数一直阻塞
- **解决**: 在 `future.result()` 中添加180秒超时控制
- **影响**: 即使任务卡住也能正常继续，程序能正常结束

---

## 📝 使用说明

### 1. 财务数据下载

**正常下载（全量）**:
```powershell
python -m tools.generate_financial_data
```

**测试模式（只下载2只股票）**:
```powershell
$env:TEST_MODE='true'
python -m tools.generate_financial_data
```

**退出测试模式**:
```powershell
$env:TEST_MODE='false'
python -m tools.generate_financial_data
```

### 2. AI风格进化持久化

**自动功能**:
- 风格进化时自动保存，无需手动操作
- 程序启动时自动加载历史数据
- 数据存储在 `logs/trades.db` 数据库中

**查看风格进化历史**:
```python
from data_persistence import DataPersistence

dp = DataPersistence()
# 加载指定模型的风格进化历史
history = dp.load_style_evolution('模型名称', limit=100)
for record in history:
    print(f"周期 {record['cycle']}: {record['from_style']} -> {record['to_style']}")

# 加载指定模型的AI人格数据
persona = dp.load_persona_data('模型名称')
if persona:
    print(f"当前风格: {persona['current_style']}")
    print(f"风险偏好: {persona['risk_tolerance']}")
```

---

## 🔄 数据库迁移

如果是从旧版本升级，数据库会自动创建新表：
- `style_evolution` - 风格进化历史表
- `persona_data` - AI人格数据表

**无需手动迁移**，程序首次运行时会自动创建这些表。

---

## ⚠️ 注意事项

1. **超时时间**: 每个财务数据下载任务最多等待180秒，超时会被跳过
2. **数据持久化**: 风格进化数据保存在 `logs/trades.db`，请确保该目录有写权限
3. **数据库路径**: 在打包环境中，数据库路径会使用exe所在目录的 `logs/trades.db`
4. **历史数据加载**: 程序启动时会加载所有模型的风格进化历史，如果数据量很大可能会稍微影响启动速度

---

## 📊 性能影响

- **财务数据下载**: 增加了任务级超时控制，防止卡死，对正常下载速度无影响
- **风格进化持久化**: 数据库操作是异步的，对交易流程性能影响极小
- **启动速度**: 加载历史风格数据会增加少量启动时间（通常<1秒）

---

## 5. 投资风格系统完善

#### 5.1 新增投资风格定义模块

**文件**: `investment_styles.py`

**功能概述**:
- 统一管理所有可用的投资风格类型
- 为AI提供清晰的风格选项列表
- 支持风格分类和描述

**核心数据结构**:

1. **投资风格字典** (`INVESTMENT_STYLES`):
   - 包含30种投资风格及其详细描述
   - 每个风格都有清晰的说明

2. **风格分类** (`STYLE_CATEGORIES`):
   - 将风格按类型分类（10个分类）
   - 方便AI理解和选择

**风格统计**:
- 总风格数：30种
- 总分类数：10类

#### 5.2 投资风格分类详情

**1. 量化类（3种）**:
- `quantitative` - 量化投资
- `algorithmic` - 算法交易
- `statistical_arbitrage` - 统计套利

**2. 价值类（3种）**:
- `value` - 价值投资
- `deep_value` - 深度价值
- `dividend` - 股息投资

**3. 成长类（3种）**:
- `growth` - 成长投资
- `aggressive_growth` - 激进成长
- `quality_growth` - 优质成长

**4. 趋势类（3种）**:
- `momentum` - 动量投资
- `trend_following` - 趋势跟踪
- `breakout` - 突破交易

**5. 套利类（3种）**:
- `arbitrage` - 套利投资
- `pairs_trading` - 配对交易
- `event_driven` - 事件驱动

**6. 技术分析类（3种）**:
- `technical` - 技术分析
- `swing_trading` - 波段交易
- `scalping` - 高频交易

**7. 基本面类（3种）**:
- `fundamental` - 基本面分析
- `sector_rotation` - 行业轮动
- `macro` - 宏观投资

**8. 混合类（4种）**:
- `balanced` - 平衡型
- `multi_strategy` - 多策略
- `hybrid` - 混合型
- `adaptive_investor` - 自适应投资者

**9. 博弈类（4种）** ✨ 新增:
- `speculative_trading` - 投机交易 - 聚焦短期价格波动，通过预判市场情绪与资金流向获利
- `contrarian_investing` - 逆向投资 - 博弈市场共识偏差，在大众悲观/乐观时反向布局（如抄底、逃顶）
- `sector_rotation_game` - 行业轮动博弈 - 预判政策导向、资金轮动节奏，切换布局高景气或低估行业
- `volatility_trading` - 波动率博弈 - 不赌价格方向，仅通过预判市场波动率升降（如VIX指数波动）获利

**10. 探索类（1种）**:
- `exploratory` - 探索型

#### 5.3 集成到AI提示词系统

**文件**: `ai_trading_engine.py`

**变更1**: 导入风格模块
```python
from investment_styles import INVESTMENT_STYLES, format_styles_for_prompt, get_style_description
```

**变更2**: 在提示词中显示风格选项

在 `_get_self_discovery_philosophy_prompt()` 方法中：
- 自动在提示词中显示所有可用的投资风格类型
- AI可以根据自己的特质选择合适的风格
- 风格描述帮助AI理解每种风格的特点

**变更3**: 在选股提示词中加入风格说明

在 `_get_self_discovery_selection_prompt()` 方法中：
- 显示风格分类和描述
- 帮助AI根据风格选择合适的选股逻辑

**代码示例**:
```python
可选的投资风格类型：
{format_styles_for_prompt()}

请以JSON格式返回，所有内容必须使用中文：
{{
    "current_philosophy": "你的投资哲学描述",
    "investment_style": "从上述风格中选择一个，或自定义风格名称",
    "risk_tolerance": "低/中/高",
    ...
}}
```

#### 5.4 工具函数

**提供以下工具函数**:

1. **`get_style_description(style: str)`** - 获取风格描述
2. **`get_all_styles()`** - 获取所有风格列表
3. **`get_styles_by_category()`** - 按分类获取风格
4. **`format_styles_for_prompt()`** - 格式化风格列表用于提示词

#### 5.5 添加新风格的方法

**步骤**:
1. 在 `INVESTMENT_STYLES` 字典中添加新风格：
   ```python
   "your_new_style": "风格描述 - 详细说明该风格的特点",
   ```

2. 在 `STYLE_CATEGORIES` 中归类：
   ```python
   "你的分类": ["your_new_style", ...],
   ```

3. 系统会自动识别并在提示词中显示新风格

#### 5.6 使用示例

**在配置文件中设置初始风格**:
```python
{
    'name': '模型名',
    'initial_persona': 'speculative_trading',  # 使用投机交易风格
    # ... 其他配置 ...
}
```

**在代码中获取风格描述**:
```python
from investment_styles import get_style_description

desc = get_style_description('quantitative')
# 返回: "量化投资 - 基于数学模型和统计分析的量化策略"
```

---

## 🎯 后续计划

1. 考虑添加风格进化历史可视化界面
2. 考虑添加风格进化数据分析功能
3. 考虑优化数据库查询性能（如果数据量很大）
4. 考虑添加风格进化数据的导出功能
5. 考虑添加风格性能统计和分析功能

---

## 📅 更新日期

**2025-11-22**

---

## 👥 贡献者

- 修复财务数据下载问题
- 实现AI风格进化持久化方案
- 添加超时控制机制
- 实现持仓记录恢复功能

---

## 📄 相关文件

- `tools/generate_financial_data.py` - 财务数据下载脚本
- `data_persistence.py` - 数据持久化模块
- `ai_trading_engine.py` - AI交易引擎主文件
- `data_query.py` - 数据查询模块（用于查询交易记录）
- `investment_styles.py` - 投资风格定义模块 ✨ 新增

---



