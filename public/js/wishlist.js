const toggleWishlist = async (productId, button) => {
  try {
    const icon = button.querySelector('i');
    const isInWishlist = icon.classList.contains('fa-solid');
    button.disabled = true;

    const url = isInWishlist ? `/wishlist/remove/${productId}` : `/wishlist/add/${productId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      icon.classList.toggle('fa-solid', result.isInWishlist);
      icon.classList.toggle('fa-regular', !result.isInWishlist);
      showToast(result.message, 'success');
      
      document.querySelectorAll(`button[data-product-id="${productId}"] i`).forEach(i => {
        i.classList.toggle('fa-solid', result.isInWishlist);
        i.classList.toggle('fa-regular', !result.isInWishlist);
      });
    } else {
      showToast(result.message, 'error');
    }
  } catch (error) {
    console.error('Error toggling wishlist:', error);
    showToast('Failed to update wishlist. Please try again.', 'error');
  } finally {
    button.disabled = false;
  }
};

const showToast = (message, type) => {
  const toastContainer = document.createElement('div');
  toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
  toastContainer.style.zIndex = '1050';
  toastContainer.innerHTML = `
    <div class="toast align-items-center text-white bg-${type === 'success' ? 'success' : 'danger'} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  document.body.appendChild(toastContainer);
  const toast = new bootstrap.Toast(toastContainer.querySelector('.toast'));
  toast.show();
  setTimeout(() => toastContainer.remove(), 3000);
};