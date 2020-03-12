<script>
  import Product from "./Product.svelte";
  import Buttton from "./Button.svelte";
  import Cart from "./Cart.svelte";

  let title = "";
  let price = 0;
  let description = "";

  let products = [];
  let cartItems = [];
  function createProduct() {
    const newProduct = {
      title,
      price,
      description
    };
    products = [...products, newProduct];
  }

  function addToCart(event) {
    const selectedtitle = event.detail;
    cartItems = cartItems.concat({
      ...products.find(prod => prod.title === selectedtitle)
    });
    console.log(cartItems);
  }
</script>

<style>
  section {
    width: 30rem;
    margin: auto;
  }
  label,
  input,
  textarea {
    width: 100%;
  }
</style>

<section>
  <Cart items={cartItems} />
</section>

<hr />
<section>
  <div>
    <label for="title">Title</label>
    <input type="text" id="title" bind:value={title} />
  </div>
  <div>
    <label for="price">Price</label>
    <input type="number" id="price" bind:value={price} />
  </div>
  <div>
    <label for="description">Description</label>
    <textarea rows="3" id="description" bind:value={description} />
  </div>
  <Buttton on:click={createProduct}>Create Product</Buttton>

</section>

<section>
  {#if products.length === 0}
    <p>No Products were added yet</p>
  {:else}
    {#each products as product}
      <Product
        productTitle={product.title}
        productPrice={product.price}
        productDescription={product.description}
        on:addcart={addToCart} />
    {/each}
  {/if}

</section>
