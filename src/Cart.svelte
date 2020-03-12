<script>
  export let items;
  $: cartTotal = items.reduce((sum, curValue) => {
    return sum + curValue.price;
  }, 0);
  var formatter = new Intl.NumberFormat("en-us", {
    style: "currency",
    currency: "USD"
  });
</script>

<style>
  ul {
    list-style-type: none;
    margin: 1rem;
    padding: 0;
  }
  li {
    margin: 0.5rem 0;
    padding: 0.5rem;
    border: 1px solid #ccc;
  }
  h1 {
    font-size: 1.5rem;
    margin: 1rem;
  }
</style>

{#if items.length === 0}
  <p>No items in cart</p>
{:else}
  <ul>
    {#each items as item}
      <li>{item.title} - {formatter.format(item.price)}</li>
    {/each}
  </ul>

  <h1>Total: ${cartTotal}</h1>
{/if}
