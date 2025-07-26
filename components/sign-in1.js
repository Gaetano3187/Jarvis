import { useTranslations } from 'next-intl';
// components/sign-in1.js
import React, { Fragment } from 'react'
import PropTypes from 'prop-types'

const SignIn1 = ({ rootClassName = '', heading1, action1 }) => {
  return (
    <>
      <div
        className={`sign-in1-container1 thq-section-padding ${rootClassName}`}
      >
        <div className="sign-in1-max-width thq-section-max-width">
          {/* ────────────── CARD ────────────── */}
          <div className="sign-in1-form-root">
            <div className="sign-in1-form1">
              {/* Titolo */}
              <div className="sign-in1-title-root">
                <h2 className="thq-heading-2">
                  {heading1 ?? (
                    <Fragment>
                      <span className="sign-in1-text8">Sign In</span>
                    </Fragment>
                  )}
                </h2>
              </div>

              {/* --- CAMPI (no <form>) --- */}
              <div className="sign-in1-form2">
                {/* Email */}
                <div className="sign-in1-email">
                  <label
                    htmlFor="thq-sign-in-1-email"
                    className="thq-body-large"
                  >
                    Email
                  </label>
                  <input
                    id="thq-sign-in-1-email"
                    name="email"
                    type="email"
                    placeholder="Email address"
                    required
                    className="sign-in1-textinput1 thq-input thq-body-large"
                  />
                </div>

                {/* Password */}
                <div className="sign-in1-password">
                  <label
                    htmlFor="thq-sign-in-1-password"
                    className="thq-body-large"
                  >
                    Password
                  </label>
                  <input
                    id="thq-sign-in-1-password"
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                    className="sign-in1-textinput2 thq-input thq-body-large"
                  />
                </div>

                {/* Bottone: il submit è gestito dal <form> padre */}
                <button
                  type="submit"
                  className="sign-in1-button thq-button-filled"
                  style={{ width: '100%' }}
                >
                  <span className="thq-body-small">
                    {action1 ?? 'Sign In'}
                  </span>
                </button>
              </div>

              {/* Note & link */}
              <div className="sign-in1-terms-agree">
                <p className="thq-body-large">
                  By continuing, you agree to the Terms of use and Privacy
                  Policy.
                </p>
              </div>
              <div className="sign-in1-container5">
                <a href="#" className="sign-in1-link1 thq-body-small">
                  Issues with Sign in
                </a>
                <a href="#" className="sign-in1-link2 thq-body-small">
                  Forgot password
                </a>
              </div>
            </div>
          </div>

          {/* Linea divisoria decorativa */}
          <div className="sign-in1-container6">
            <div className="sign-in1-divider1">
              <div className="sign-in1-divider2" />
              <div className="sign-in1-divider3" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

SignIn1.propTypes = {
  rootClassName: PropTypes.string,
  heading1: PropTypes.element,
  action1: PropTypes.element,
}

export default SignIn1
