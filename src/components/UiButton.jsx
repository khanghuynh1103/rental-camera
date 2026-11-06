import { Button } from 'antd';

// Keep the native form behavior of the existing pages while using Ant Design.
export default function UiButton({ type = 'submit', children, ...props }) {
  return (
    <Button htmlType={type} {...props}>
      {children}
    </Button>
  );
}
