const option = (key, type, value, label, group, extra = {}) => ({key,type,value,label,group,...extra});
export const OPTIONS = [
    option('repository','s','owner/repository','Репозиторий (owner/repository)','Подключение'),
    option('limit','i',3,'Количество PR','PR',{min:1,max:10}),
    option('sort','s','created','Сортировка','PR',{choices:['created','updated'],labels:['По дате создания','По дате обновления']}),
    option('direction','s','desc','Порядок','PR',{choices:['desc','asc'],labels:['Сначала новые','Сначала старые']}),
    option('author','s','','Автор (пусто — все)','PR'),
    ...['open','draft','merged','closed'].map((state,i)=>option(`include-${state}`,'b',true,['Открытые PR','Черновики','Слитые PR','Закрытые без слияния'][i],'PR')),
    option('manual-only','b',false,'Только ручное обновление','Обновление'),
    option('auto-refresh','b',true,'Периодическое обновление','Обновление'),
    option('refresh-seconds','i',60,'Интервал, секунд','Обновление',{min:1,max:2147483647}),
    option('refresh-on-start','b',true,'Обновлять при включении расширения','Обновление'),
    option('refresh-on-menu','b',true,'Обновлять при открытии меню','Обновление'),
    option('position','s','right','Расположение','Панель',{choices:['left','center','right'],labels:['Слева','По центру','Справа']}),
    ...[['left','Слева'],['center','По центру'],['right','Справа']].flatMap(([position,label])=>[
        option(`panel-${position}-margin-left`,'i',0,'Отступ слева, px',`Отступы: ${label}`,{min:0,max:500}),
        option(`panel-${position}-margin-right`,'i',0,'Отступ справа, px',`Отступы: ${label}`,{min:0,max:500}),
    ]),
    option('color-states','b',true,'Цветовые обозначения состояний PR','Оформление'),
    option('panel-state','b',true,'Состояния PR (цветные метки)','Панель'),
    option('panel-icon','b',true,'Значок GitHub','Панель'),
    option('panel-count','b',false,'Количество PR','Панель'),
    option('panel-numbers','b',true,'Номера PR','Панель'),
    option('panel-summary','b',true,'Статусы проверок','Панель'),
    ...[['number','Номер PR'],['title','Название'],['state','Состояние PR'],['summary','Сводка проверок'],['details','Отдельные проверки'],['updated','Время обновления']].map(([key,label])=>option(`menu-${key}`,'b',true,label,'Меню')),
    option('source-checks','b',true,'GitHub Checks','Проверки'),
    option('source-statuses','b',true,'Классические commit statuses','Проверки'),
    option('check-filter','s','all','Показывать проверки','Проверки',{choices:['all','running','problems'],labels:['Все','Только выполняющиеся и ожидающие','Только проблемные']}),
    option('open-links','b',true,'Открывать ссылки нажатием','Меню'),
];
export const DEFAULTS = Object.fromEntries(OPTIONS.map(o=>[o.key,o.value]));
export function validateSettings(values) {
    const s = {...DEFAULTS,...values};
    for (const o of OPTIONS) {
        const v=s[o.key];
        if ((o.type==='b' && typeof v!=='boolean') || (o.type==='s' && typeof v!=='string') || (o.type==='i' && (!Number.isInteger(v)||v<o.min||v>o.max))) throw new Error(`Некорректное значение: ${o.label}`);
        if(o.choices && !o.choices.includes(v)) throw new Error(`Некорректное значение: ${o.label}`);
    }
    s.repository=s.repository.trim(); s.author=s.author.trim();
    if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(s.repository) || ['.','..'].includes(s.repository.split('/')[1])) throw new Error('Укажите репозиторий в формате owner/repository');
    if(s.author && !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(s.author)) throw new Error('Некорректный GitHub login автора');
    return s;
}
export function readSettings(settings) {
    return validateSettings(Object.fromEntries(OPTIONS.map(o=>[o.key,settings[{b:'get_boolean',s:'get_string',i:'get_int'}[o.type]](o.key)])));
}
