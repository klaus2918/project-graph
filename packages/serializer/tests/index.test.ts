import { describe, expect, test } from "vitest";
import { configureSerializer, deserialize, id, serializable, serialize } from "../src";

describe("对象序列化", () => {
  class A {
    @serializable
    public propString: string;
    @serializable
    public propNumber: number;
    @serializable
    public propBoolean: boolean;
    @serializable
    public propArray: string[];
    @serializable
    public nestedObject: { name: string; age: number };
    @serializable
    public nestedInstance?: A;

    constructor(
      propString: string,
      propNumber: number,
      propBoolean: boolean,
      propArray: string[],
      nestedObject: { name: string; age: number },
      nestedInstance?: A,
    ) {
      this.propString = propString;
      this.propNumber = propNumber;
      this.propBoolean = propBoolean;
      this.propArray = propArray;
      this.nestedObject = nestedObject;
      this.nestedInstance = nestedInstance;
    }
  }
  const instance = new A(
    "@graphif/serializer",
    114514,
    false,
    ["hello", "world"],
    { name: "Traveller", age: 1000 },
    new A("nested", 123, true, ["nested"], { name: "Trailblazer", age: 2000 }),
  );
  const serialized = {
    _: "A",
    propString: "@graphif/serializer",
    propNumber: 114514,
    propBoolean: false,
    propArray: ["hello", "world"],
    nestedObject: { name: "Traveller", age: 1000 },
    nestedInstance: {
      _: "A",
      propString: "nested",
      propNumber: 123,
      propBoolean: true,
      propArray: ["nested"],
      nestedObject: { name: "Trailblazer", age: 2000 },
    },
  };

  test("序列化对象", () => {
    const serialized = serialize(instance);
    expect(serialized._).toBe("A");
    expect(serialized.nestedInstance._).toBe("A");
    expect(serialized.propString).toBe("@graphif/serializer");
  });
  test("反序列化对象", () => {
    const deserialized = deserialize(serialized);
    expect(deserialized).toBeInstanceOf(A);
    expect(deserialized.nestedInstance).toBeInstanceOf(A);
    expect(deserialized.propString).toBe("@graphif/serializer");
  });

  test("使用稳定类名而不是压缩后的运行时类名", () => {
    class a {
      static className = "StableClass";

      @serializable
      value: string;

      constructor(value: string) {
        this.value = value;
      }
    }

    const serialized = serialize(new a("value"));
    expect(serialized).toEqual({ _: "StableClass", value: "value" });
    expect(deserialize(serialized)).toBeInstanceOf(a);
  });

  test("配置的类名解析器会回退到运行时类名", () => {
    configureSerializer((class_) => class_.className!);

    class C {
      @serializable
      value: string;

      constructor(value: string) {
        this.value = value;
      }
    }

    const serialized = serialize(new C("value"));
    expect(serialized).toEqual({ _: "C", value: "value" });
    expect(deserialize(serialized)).toBeInstanceOf(C);
  });

  // 指针引用同一性的反序列化测试（数组与对象容器）
  class B {
    @serializable
    public items: number[];
    @serializable
    public meta: { tag: string; count: number };
    @serializable
    public mirrorItems?: number[];
    @serializable
    public mirrorMeta?: { tag: string; count: number };

    constructor(
      items: number[],
      meta: { tag: string; count: number },
      mirrorItems?: number[],
      mirrorMeta?: { tag: string; count: number },
    ) {
      this.items = items;
      this.meta = meta;
      this.mirrorItems = mirrorItems;
      this.mirrorMeta = mirrorMeta;
    }
  }

  test("反序列化时，数组与对象容器通过指针保持同一实例", () => {
    const json = {
      _: "B",
      items: [1, 2, 3],
      meta: { tag: "t", count: 2 },
      mirrorItems: { $: "/items" },
      mirrorMeta: { $: "/meta" },
    };
    const b = deserialize(json) as B;

    expect(b).toBeInstanceOf(B);
    expect(Array.isArray(b.items)).toBe(true);
    expect(Array.isArray(b.mirrorItems)).toBe(true);
    expect(b.items).toBe(b.mirrorItems);

    expect(typeof b.meta).toBe("object");
    expect(b.meta).toBe(b.mirrorMeta);
  });
});

describe("数组序列化", () => {
  const arr = [1, "2", true, { name: "Traveller", age: 1000 }, [1, 2, 3]];
  const serialized = [1, "2", true, { name: "Traveller", age: 1000 }, [1, 2, 3]];

  test("序列化数组", () => {
    const serialized = serialize(arr);
    expect(serialized).toEqual(serialized);
  });
  test("反序列化数组", () => {
    const deserialized = deserialize(serialized);
    expect(deserialized).toEqual(arr);
  });
});

/**
 * 以下为优化序列化器性能前补的特征测试：锁住既有行为，避免纯性能改动引入语义漂移。
 */
describe("序列化器行为特征（性能优化前的基线）", () => {
  class IdNode {
    @id
    @serializable
    public uuid: string;
    @serializable
    public value: number;

    constructor(uuid: string, value: number) {
      this.uuid = uuid;
      this.value = value;
    }
  }

  class IdHolder {
    @serializable
    public first: IdNode;
    @serializable
    public second: IdNode;

    constructor(first: IdNode, second: IdNode) {
      this.first = first;
      this.second = second;
    }
  }

  test("同一个对象被引用两次时，第二次序列化为 $ 路径引用", () => {
    const node = new IdNode("n1", 7);
    const holder = new IdHolder(node, node);

    const result = serialize(holder);

    expect(result.first).toMatchObject({ _: "IdNode", uuid: "n1", value: 7 });
    // 第二次出现同一个 id，退化为路径引用
    expect(result.second).toEqual({ $: "/first" });

    const restored = deserialize(result) as IdHolder;
    expect(restored.first).toBe(restored.second);
  });

  test("数组元素也会被 id 引用", () => {
    const node = new IdNode("n2", 1);
    const list = [node, node, new IdNode("n3", 2)];

    const result = serialize(list) as unknown[];

    expect(result[0]).toMatchObject({ _: "IdNode", uuid: "n2" });
    expect(result[1]).toEqual({ $: "/0" });
    expect(result[2]).toMatchObject({ _: "IdNode", uuid: "n3" });
  });

  test("非整数保留两位小数（负数同样处理）", () => {
    class Num {
      @serializable
      public positive: number;
      @serializable
      public negative: number;
      @serializable
      public integer: number;

      constructor(positive: number, negative: number, integer: number) {
        this.positive = positive;
        this.negative = negative;
        this.integer = integer;
      }
    }

    const result = serialize(new Num(0.123456, -1.987654, 42));

    expect(result.positive).toBe(0.12);
    expect(result.negative).toBe(-1.99);
    expect(result.integer).toBe(42);
  });

  test("子类会序列化继承自父类的可序列化字段", () => {
    class Base {
      @serializable
      public baseValue: string;
      @serializable
      public baseList: number[];

      constructor(baseValue: string, baseList: number[]) {
        this.baseValue = baseValue;
        this.baseList = baseList;
      }
    }

    class Derived extends Base {
      @serializable
      public derivedValue: string;

      constructor(baseValue: string, baseList: number[], derivedValue: string) {
        super(baseValue, baseList);
        this.derivedValue = derivedValue;
      }
    }

    const result = serialize(new Derived("b", [1, 2], "d"));

    expect(result._).toBe("Derived");
    expect(result.baseValue).toBe("b");
    expect(result.baseList).toEqual([1, 2]);
    expect(result.derivedValue).toBe("d");
    expect(deserialize(result)).toMatchObject({ baseValue: "b", derivedValue: "d" });
  });

  test("未标记 @serializable 的字段不参与序列化", () => {
    class Mixed {
      @serializable
      public kept: string;
      public dropped: string;

      constructor(kept: string, dropped: string) {
        this.kept = kept;
        this.dropped = dropped;
      }
    }

    const result = serialize(new Mixed("k", "d"));

    expect(result.kept).toBe("k");
    expect("dropped" in result).toBe(false);
  });

  test("id 字段值在反序列化后保持一致（用于引用解析）", () => {
    const node = new IdNode("keep-me", 5);
    const result = serialize([node]);
    const restored = deserialize(result) as IdNode[];

    expect(restored[0].uuid).toBe("keep-me");
    expect(restored[0].value).toBe(5);
  });

  test("类名解析与字段清单按类缓存，同类多实例不会重复解析", () => {
    let resolveCount = 0;
    configureSerializer((class_) => {
      resolveCount++;
      return class_.className!;
    });

    class CachedName {
      static className = "CachedName";

      @serializable
      public value: number;

      constructor(value: number) {
        this.value = value;
      }
    }

    const list = Array.from({ length: 500 }, (_, i) => new CachedName(i));
    const result = serialize(list) as unknown[];

    expect(result).toHaveLength(500);
    expect(result[0]).toMatchObject({ _: "CachedName", value: 0 });
    expect(result[499]).toMatchObject({ _: "CachedName", value: 499 });
    // 若退化为逐实例解析，这里会是 500
    expect(resolveCount).toBeLessThanOrEqual(2);
  });

  test("中途更改类名解析器后，已缓存的类名会重新解析（不能用到过期缓存）", () => {
    // 前置条件：configureSerializer 包装后的解析器只对声明了 static className 的类生效，
    // 没有 static className 的类直接回退到运行时类名（见“配置的类名解析器会回退到运行时类名”用例）。
    // 生产环境时序：app/index.html 在任何业务代码之前调用 configureSerializer。
    configureSerializer(() => "First");

    class Renamed {
      static className = "Renamed";

      @serializable
      public value: number;

      constructor(value: number) {
        this.value = value;
      }
    }

    expect(serialize(new Renamed(1))._).toBe("First");

    // 解析规则变化后，此前缓存的类名必须作废并重新解析
    configureSerializer(() => "Second");

    expect(serialize(new Renamed(2))._).toBe("Second");
  });

  test("完整输出形状与字段顺序稳定（防性能优化引入语义漂移）", () => {
    class Leaf {
      @serializable
      public v: number;

      constructor(v: number) {
        this.v = v;
      }
    }

    class Mid {
      @serializable
      public name: string;
      @serializable
      public ratio: number;
      @serializable
      public leaf: Leaf;
      @serializable
      public list: Leaf[];
      // 未标记字段必须被排除
      public ignored = "should-not-appear";

      constructor(name: string, ratio: number, leaf: Leaf, list: Leaf[]) {
        this.name = name;
        this.ratio = ratio;
        this.leaf = leaf;
        this.list = list;
      }
    }

    const result = serialize(new Mid("n", 0.004, new Leaf(1.2345), [new Leaf(2), new Leaf(3)]));

    // 逐字段比对：类名标记、小数舍入、嵌套对象、数组、未标记字段排除
    expect(result).toEqual({
      _: "Mid",
      name: "n",
      ratio: 0,
      leaf: { _: "Leaf", v: 1.23 },
      list: [
        { _: "Leaf", v: 2 },
        { _: "Leaf", v: 3 },
      ],
    });
    // 字段顺序必须保持声明/可枚举顺序，_ 在最前
    expect(Object.keys(result)).toEqual(["_", "name", "ratio", "leaf", "list"]);
  });
});
