import "reflect-metadata";

type SerializableClass = {
  className?: string;
  name: string;
  new (...args: any[]): any;
};

let getOriginalNameOf: (class_: SerializableClass) => string = (class_) => class_.className ?? class_.name;
export function configureSerializer(getOriginalNameOfFn: (class_: SerializableClass) => string) {
  getOriginalNameOf = (class_) => (class_.className === undefined ? class_.name : getOriginalNameOfFn(class_));
  // 类名解析规则变了，已经缓存的类名必须作废
  classMetaCache.clear();
}

/**
 * 装饰器阶段登记的可序列化字段名 / id 字段名。
 * 为什么不在序列化时用 Reflect 枚举：`Reflect.getOwnMetadataKeys` 返回的是“元数据键”
 * 而不是属性名（实测返回 [null]），拿不到字段列表；而装饰器本身就带有 key，登记最直接。
 * 依赖继承时通过构造器原型链向上合并。
 */
const decoratedSerializableKeys = new Map<object, Set<string>>();
const decoratedIdKeys = new Map<object, string>();

/**
 * 序列化装饰器
 */
const serializableSymbol = Symbol("serializable");
const lastSerializableIndexSymbol = Symbol("lastSerializableIndex");
export const serializable = (target: any, key: string) => {
  if (!Reflect.hasMetadata(lastSerializableIndexSymbol, target)) {
    Reflect.defineMetadata(lastSerializableIndexSymbol, 0, target);
  }
  Reflect.defineMetadata(serializableSymbol, Reflect.getMetadata(lastSerializableIndexSymbol, target), target, key);
  Reflect.defineMetadata(
    lastSerializableIndexSymbol,
    Reflect.getMetadata(lastSerializableIndexSymbol, target) + 1,
    target,
  );
  classes.set(getOriginalNameOf(target.constructor), target.constructor);
  const ctor = target.constructor;
  let keys = decoratedSerializableKeys.get(ctor);
  if (keys === undefined) {
    keys = new Set<string>();
    decoratedSerializableKeys.set(ctor, keys);
  }
  keys.add(key);
  // 字段集合可能变化，已缓存的类元数据需要作废
  classMetaCache.delete(ctor);
};

const passExtraAtArg1Symbol = Symbol("passExtraAtArg1");
export const passExtraAtArg1 = Reflect.metadata(passExtraAtArg1Symbol, true);

const passExtraAtLastArgSymbol = Symbol("passExtraAtLastArg");
export const passExtraAtLastArg = Reflect.metadata(passExtraAtLastArgSymbol, true);

const passObjectSymbol = Symbol("passObject");
export const passObject = Reflect.metadata(passObjectSymbol, true);

const idSymbol = Symbol("id");
export const id = (target: any, key?: string): void => {
  if (typeof key === "string") {
    Reflect.defineMetadata(idSymbol, true, target, key);
    const ctor = target.constructor as object;
    if (decoratedIdKeys.get(ctor) === undefined) {
      decoratedIdKeys.set(ctor, key);
    }
    // id 字段可能变化，已缓存的类元数据需要作废
    classMetaCache.delete(ctor);
  } else {
    // 作为类装饰器使用时的分支（无属性名）
    Reflect.defineMetadata(idSymbol, true, target);
  }
};

const classes: Map<string, any> = new Map();

/**
 * 类的序列化元数据。
 * 元数据只由装饰器在类定义期写入原型链，与实例无关，因此可以按构造器缓存。
 * 原来在序列化时对每个字段调用两次 `Reflect.hasMetadata`（沿原型链查找），
 * 实测占整个 serialize 耗时的约一半；改成一次查表后语义不变、开销大幅下降。
 */
type ClassSerializationMeta = {
  /** 该类的全部可序列化字段名（含继承） */
  serializableKeys: Set<string>;
  /** 标记为 @id 的字段名；声明在父类时也适用 */
  idKey: string | null;
  /** 解析后的类名 */
  name: string;
};

const classMetaCache = new Map<object, ClassSerializationMeta>();

function getClassSerializationMeta(ctor: object): ClassSerializationMeta {
  const cached = classMetaCache.get(ctor);
  if (cached !== undefined) {
    return cached;
  }
  const serializableKeys = new Set<string>();
  let idKey: string | null = null;
  // 沿构造器原型链向上合并，保证子类能看到父类声明的字段
  let current: unknown = ctor;
  while (typeof current === "function" && current !== Function.prototype) {
    const ownKeys = decoratedSerializableKeys.get(current);
    if (ownKeys !== undefined) {
      for (const key of ownKeys) {
        serializableKeys.add(key);
      }
    }
    const ownIdKey = decoratedIdKeys.get(current);
    if (ownIdKey !== undefined && idKey === null) {
      idKey = ownIdKey;
    }
    current = Object.getPrototypeOf(current) as unknown;
  }
  const meta: ClassSerializationMeta = {
    serializableKeys,
    idKey,
    name: getOriginalNameOf(ctor as unknown as SerializableClass),
  };
  classMetaCache.set(ctor, meta);
  return meta;
}

/**
 * 将任意类型对象转换为 序列化形式，不包含函数
 */
export function serialize(originalObj: any): any {
  const id2path = new Map<string, string>();
  function _serialize(obj: any, path: string): any {
    if (obj instanceof Array) {
      return obj.map((v, i) => _serialize(v, `${path}/${i}`));
    } else if (typeof obj === "string") {
      return obj;
    } else if (typeof obj === "number") {
      // 判断是否是整数
      if (obj % 1 === 0) {
        return obj;
      } else {
        // 保留2位小数
        return parseFloat(obj.toFixed(2));
      }
    } else if (typeof obj === "boolean") {
      return obj;
    } else if (obj === null) {
      return null;
    } else if (typeof obj === "object") {
      const ctor = obj.constructor;
      if (ctor === undefined || ctor === null) {
        throw TypeError("[Serializer] Cannot determine serialized type for", obj);
      }
      const meta = getClassSerializationMeta(ctor);
      const className = meta.name;
      if (!className) {
        throw TypeError("[Serializer] Cannot determine serialized type for", obj);
      }
      if (className === "Object") {
        return obj;
      }
      const result: any = {
        _: className,
      };
      let id: any;
      // 仍用 for...in 保证字段顺序与原实现一致；缓存只用于成员判断
      for (const key in obj) {
        if (!meta.serializableKeys.has(key)) continue;
        if (key === meta.idKey) {
          id = obj[key];
        }
        result[key] = _serialize(obj[key], `${path}/${key}`);
      }
      if (id) {
        if (id2path.has(id)) {
          // 如果已经有了id，直接使用之前的路径
          return { $: id2path.get(id) };
        } else {
          // 如果没有id，记录路径
          id2path.set(id, path);
        }
      }
      return result;
    } else if (typeof obj === "undefined") {
      return undefined;
    } else {
      throw TypeError(`[Serializer] Unsupported value type ${obj}`);
    }
  }
  return _serialize(originalObj, "");
}

export function deserialize(originalJson: any, extra?: any): any {
  const cache = new WeakMap<object, any>();
  function _deserialize(json: any, extra?: any): any {
    if (json instanceof Array) {
      if (cache.has(json)) {
        return cache.get(json);
      }
      // 就地转换并缓存，保证同一数组节点被反序列化为同一实例
      cache.set(json, json);
      for (let i = 0; i < json.length; i++) {
        json[i] = _deserialize(json[i], extra);
      }
      return json;
    }
    if (!isSerializedObject(json)) {
      return json;
    }
    if (cache.has(json)) {
      return cache.get(json);
    }
    const className = json._;
    const class_ = classes.get(className);
    if (!class_) {
      throw TypeError(`[Serializer] Cannot find class ${className} of ${JSON.stringify(json)}`);
    }
    // 先把json中有_的值反序列化
    for (const key in json) {
      if (key === "_") continue;
      const value = json[key];
      if (isSerializedObject(value) || value instanceof Array) {
        json[key] = _deserialize(value, extra);
      }
    }
    const args = [];
    if (Reflect.hasMetadata(passExtraAtArg1Symbol, class_)) {
      args.push(extra);
    }
    if (Reflect.hasMetadata(passObjectSymbol, class_)) {
      args.push(json);
    } else {
      for (const key in json) {
        if (key === "_") continue;
        args.push(json[key]);
      }
    }
    if (Reflect.hasMetadata(passExtraAtLastArgSymbol, class_)) {
      args.push(extra);
    }
    const instance = new class_(...args);
    cache.set(json, instance);
    return instance;
  }
  return _deserialize(replaceRef(originalJson), extra);
}

function isSerializedObject(obj: any): boolean {
  return typeof obj === "object" && obj !== null && "_" in obj;
}
function getByPath(obj: any, path: string): any {
  const segments = path.split("/").filter((s) => s !== "");
  let result = obj;
  for (const segment of segments) {
    if (typeof result !== "object" || result === null) {
      throw TypeError(`[Serializer] Cannot find object at path ${path}`);
    }
    result = result[segment];
  }
  return result;
}
/**
 * 将$替换为实际值
 * @param obj 要替换的对象
 * @param refPathObj obj参数中$的路径所在的对象
 */
function replaceRef(obj: any, refPathObj: any = obj): any {
  if (obj instanceof Array) {
    return obj.map((v) => replaceRef(v, refPathObj));
  }
  if (typeof obj === "object" && obj !== null) {
    if ("$" in obj) {
      const path = obj.$ as string;
      return getByPath(refPathObj, path);
    }
    for (const key in obj) {
      obj[key] = replaceRef(obj[key], refPathObj);
    }
  }
  return obj;
}
