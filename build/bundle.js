var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/Button.svelte generated by Svelte v3.19.2 */

    function create_fragment(ctx) {
    	let button;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			attr(button, "class", "svelte-1nb60vv");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;
    			dispose = listen(button, "click", /*click_handler*/ ctx[2]);
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 1) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[0], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[0], dirty, null));
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, $$slots, click_handler];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    /* src/Product.svelte generated by Svelte v3.19.2 */

    function create_default_slot(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Add to cart");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div;
    	let h1;
    	let t0;
    	let t1;
    	let h2;
    	let t2_value = /*formatter*/ ctx[4].format(/*productPrice*/ ctx[1]) + "";
    	let t2;
    	let t3;
    	let p;
    	let t4;
    	let t5;
    	let current;

    	const buttton = new Button({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	buttton.$on("click", /*addToCart*/ ctx[3]);

    	return {
    		c() {
    			div = element("div");
    			h1 = element("h1");
    			t0 = text(/*productTitle*/ ctx[0]);
    			t1 = space();
    			h2 = element("h2");
    			t2 = text(t2_value);
    			t3 = space();
    			p = element("p");
    			t4 = text(/*productDescription*/ ctx[2]);
    			t5 = space();
    			create_component(buttton.$$.fragment);
    			attr(h1, "class", "svelte-v80j81");
    			attr(h2, "class", "svelte-v80j81");
    			attr(p, "class", "svelte-v80j81");
    			attr(div, "class", "svelte-v80j81");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h1);
    			append(h1, t0);
    			append(div, t1);
    			append(div, h2);
    			append(h2, t2);
    			append(div, t3);
    			append(div, p);
    			append(p, t4);
    			append(div, t5);
    			mount_component(buttton, div, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*productTitle*/ 1) set_data(t0, /*productTitle*/ ctx[0]);
    			if ((!current || dirty & /*productPrice*/ 2) && t2_value !== (t2_value = /*formatter*/ ctx[4].format(/*productPrice*/ ctx[1]) + "")) set_data(t2, t2_value);
    			if (!current || dirty & /*productDescription*/ 4) set_data(t4, /*productDescription*/ ctx[2]);
    			const buttton_changes = {};

    			if (dirty & /*$$scope*/ 64) {
    				buttton_changes.$$scope = { dirty, ctx };
    			}

    			buttton.$set(buttton_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(buttton.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(buttton.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(buttton);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { productTitle } = $$props;
    	let { productPrice } = $$props;
    	let { productDescription } = $$props;
    	const dispatch = createEventDispatcher();

    	function addToCart() {
    		dispatch("addcart", productTitle);
    	}

    	var formatter = new Intl.NumberFormat("en-us", { style: "currency", currency: "USD" });

    	$$self.$set = $$props => {
    		if ("productTitle" in $$props) $$invalidate(0, productTitle = $$props.productTitle);
    		if ("productPrice" in $$props) $$invalidate(1, productPrice = $$props.productPrice);
    		if ("productDescription" in $$props) $$invalidate(2, productDescription = $$props.productDescription);
    	};

    	return [productTitle, productPrice, productDescription, addToCart, formatter];
    }

    class Product extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			productTitle: 0,
    			productPrice: 1,
    			productDescription: 2
    		});
    	}
    }

    /* src/Cart.svelte generated by Svelte v3.19.2 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (31:0) {:else}
    function create_else_block(ctx) {
    	let ul;
    	let t0;
    	let h1;
    	let t1;
    	let t2;
    	let each_value = /*items*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			h1 = element("h1");
    			t1 = text("Total: $");
    			t2 = text(/*cartTotal*/ ctx[1]);
    			attr(ul, "class", "svelte-17nkhsu");
    			attr(h1, "class", "svelte-17nkhsu");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			insert(target, t0, anchor);
    			insert(target, h1, anchor);
    			append(h1, t1);
    			append(h1, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*formatter, items*/ 5) {
    				each_value = /*items*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*cartTotal*/ 2) set_data(t2, /*cartTotal*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(h1);
    		}
    	};
    }

    // (29:0) {#if items.length === 0}
    function create_if_block(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "No items in cart";
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (33:4) {#each items as item}
    function create_each_block(ctx) {
    	let li;
    	let t0_value = /*item*/ ctx[3].title + "";
    	let t0;
    	let t1;
    	let t2_value = /*formatter*/ ctx[2].format(/*item*/ ctx[3].price) + "";
    	let t2;

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = text(" - ");
    			t2 = text(t2_value);
    			attr(li, "class", "svelte-17nkhsu");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);
    			append(li, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*items*/ 1 && t0_value !== (t0_value = /*item*/ ctx[3].title + "")) set_data(t0, t0_value);
    			if (dirty & /*items*/ 1 && t2_value !== (t2_value = /*formatter*/ ctx[2].format(/*item*/ ctx[3].price) + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*items*/ ctx[0].length === 0) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { items } = $$props;
    	var formatter = new Intl.NumberFormat("en-us", { style: "currency", currency: "USD" });

    	$$self.$set = $$props => {
    		if ("items" in $$props) $$invalidate(0, items = $$props.items);
    	};

    	let cartTotal;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*items*/ 1) {
    			 $$invalidate(1, cartTotal = items.reduce(
    				(sum, curValue) => {
    					return sum + curValue.price;
    				},
    				0
    			));
    		}
    	};

    	return [items, cartTotal, formatter];
    }

    class Cart extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { items: 0 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.19.2 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	return child_ctx;
    }

    // (60:2) <Buttton on:click={createProduct}>
    function create_default_slot$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Create Product");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (67:2) {:else}
    function create_else_block$1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*products*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*products, addToCart*/ 72) {
    				each_value = /*products*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (65:2) {#if products.length === 0}
    function create_if_block$1(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "No Products were added yet";
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (68:4) {#each products as product}
    function create_each_block$1(ctx) {
    	let current;

    	const product = new Product({
    			props: {
    				productTitle: /*product*/ ctx[10].title,
    				productPrice: /*product*/ ctx[10].price,
    				productDescription: /*product*/ ctx[10].description
    			}
    		});

    	product.$on("addcart", /*addToCart*/ ctx[6]);

    	return {
    		c() {
    			create_component(product.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(product, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const product_changes = {};
    			if (dirty & /*products*/ 8) product_changes.productTitle = /*product*/ ctx[10].title;
    			if (dirty & /*products*/ 8) product_changes.productPrice = /*product*/ ctx[10].price;
    			if (dirty & /*products*/ 8) product_changes.productDescription = /*product*/ ctx[10].description;
    			product.$set(product_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(product.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(product.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(product, detaching);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let section0;
    	let t0;
    	let hr;
    	let t1;
    	let section1;
    	let div0;
    	let label0;
    	let t3;
    	let input0;
    	let t4;
    	let div1;
    	let label1;
    	let t6;
    	let input1;
    	let input1_updating = false;
    	let t7;
    	let div2;
    	let label2;
    	let t9;
    	let textarea;
    	let t10;
    	let t11;
    	let section2;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let dispose;
    	const cart = new Cart({ props: { items: /*cartItems*/ ctx[4] } });

    	function input1_input_handler() {
    		input1_updating = true;
    		/*input1_input_handler*/ ctx[8].call(input1);
    	}

    	const buttton = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	buttton.$on("click", /*createProduct*/ ctx[5]);
    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*products*/ ctx[3].length === 0) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			section0 = element("section");
    			create_component(cart.$$.fragment);
    			t0 = space();
    			hr = element("hr");
    			t1 = space();
    			section1 = element("section");
    			div0 = element("div");
    			label0 = element("label");
    			label0.textContent = "Title";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			div1 = element("div");
    			label1 = element("label");
    			label1.textContent = "Price";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			div2 = element("div");
    			label2 = element("label");
    			label2.textContent = "Description";
    			t9 = space();
    			textarea = element("textarea");
    			t10 = space();
    			create_component(buttton.$$.fragment);
    			t11 = space();
    			section2 = element("section");
    			if_block.c();
    			attr(section0, "class", "svelte-ndswdz");
    			attr(label0, "for", "title");
    			attr(label0, "class", "svelte-ndswdz");
    			attr(input0, "type", "text");
    			attr(input0, "id", "title");
    			attr(input0, "class", "svelte-ndswdz");
    			attr(label1, "for", "price");
    			attr(label1, "class", "svelte-ndswdz");
    			attr(input1, "type", "number");
    			attr(input1, "id", "price");
    			attr(input1, "class", "svelte-ndswdz");
    			attr(label2, "for", "description");
    			attr(label2, "class", "svelte-ndswdz");
    			attr(textarea, "rows", "3");
    			attr(textarea, "id", "description");
    			attr(textarea, "class", "svelte-ndswdz");
    			attr(section1, "class", "svelte-ndswdz");
    			attr(section2, "class", "svelte-ndswdz");
    		},
    		m(target, anchor) {
    			insert(target, section0, anchor);
    			mount_component(cart, section0, null);
    			insert(target, t0, anchor);
    			insert(target, hr, anchor);
    			insert(target, t1, anchor);
    			insert(target, section1, anchor);
    			append(section1, div0);
    			append(div0, label0);
    			append(div0, t3);
    			append(div0, input0);
    			set_input_value(input0, /*title*/ ctx[0]);
    			append(section1, t4);
    			append(section1, div1);
    			append(div1, label1);
    			append(div1, t6);
    			append(div1, input1);
    			set_input_value(input1, /*price*/ ctx[1]);
    			append(section1, t7);
    			append(section1, div2);
    			append(div2, label2);
    			append(div2, t9);
    			append(div2, textarea);
    			set_input_value(textarea, /*description*/ ctx[2]);
    			append(section1, t10);
    			mount_component(buttton, section1, null);
    			insert(target, t11, anchor);
    			insert(target, section2, anchor);
    			if_blocks[current_block_type_index].m(section2, null);
    			current = true;

    			dispose = [
    				listen(input0, "input", /*input0_input_handler*/ ctx[7]),
    				listen(input1, "input", input1_input_handler),
    				listen(textarea, "input", /*textarea_input_handler*/ ctx[9])
    			];
    		},
    		p(ctx, [dirty]) {
    			const cart_changes = {};
    			if (dirty & /*cartItems*/ 16) cart_changes.items = /*cartItems*/ ctx[4];
    			cart.$set(cart_changes);

    			if (dirty & /*title*/ 1 && input0.value !== /*title*/ ctx[0]) {
    				set_input_value(input0, /*title*/ ctx[0]);
    			}

    			if (!input1_updating && dirty & /*price*/ 2) {
    				set_input_value(input1, /*price*/ ctx[1]);
    			}

    			input1_updating = false;

    			if (dirty & /*description*/ 4) {
    				set_input_value(textarea, /*description*/ ctx[2]);
    			}

    			const buttton_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				buttton_changes.$$scope = { dirty, ctx };
    			}

    			buttton.$set(buttton_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(section2, null);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cart.$$.fragment, local);
    			transition_in(buttton.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(cart.$$.fragment, local);
    			transition_out(buttton.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section0);
    			destroy_component(cart);
    			if (detaching) detach(t0);
    			if (detaching) detach(hr);
    			if (detaching) detach(t1);
    			if (detaching) detach(section1);
    			destroy_component(buttton);
    			if (detaching) detach(t11);
    			if (detaching) detach(section2);
    			if_blocks[current_block_type_index].d();
    			run_all(dispose);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let title = "";
    	let price = 0;
    	let description = "";
    	let products = [];
    	let cartItems = [];

    	function createProduct() {
    		const newProduct = { title, price, description };
    		$$invalidate(3, products = [...products, newProduct]);
    	}

    	function addToCart(event) {
    		const selectedtitle = event.detail;

    		$$invalidate(4, cartItems = cartItems.concat({
    			...products.find(prod => prod.title === selectedtitle)
    		}));

    		console.log(cartItems);
    	}

    	function input0_input_handler() {
    		title = this.value;
    		$$invalidate(0, title);
    	}

    	function input1_input_handler() {
    		price = to_number(this.value);
    		$$invalidate(1, price);
    	}

    	function textarea_input_handler() {
    		description = this.value;
    		$$invalidate(2, description);
    	}

    	return [
    		title,
    		price,
    		description,
    		products,
    		cartItems,
    		createProduct,
    		addToCart,
    		input0_input_handler,
    		input1_input_handler,
    		textarea_input_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
