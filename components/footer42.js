import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Footer42 = (props) => {
  return (
    <>
      <footer className="footer42-footer7 thq-section-padding">
        <div className="footer42-max-width thq-section-max-width">
          <div className="footer42-content">
            <div className="footer42-logo1">
              <img
                alt={props.logoAlt}
                src={props.logoSrc}
                className="footer42-logo2"
              />
            </div>
            <div className="footer42-links">
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link1 ?? (
                  <Fragment>
                    <span className="footer42-text19">Home</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link2 ?? (
                  <Fragment>
                    <span className="footer42-text20">About Us</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link3 ?? (
                  <Fragment>
                    <span className="footer42-text15">Services</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link4 ?? (
                  <Fragment>
                    <span className="footer42-text14">Contact Us</span>
                  </Fragment>
                )}
              </a>
              <a
                href="https://example.com"
                target="_blank"
                rel="noreferrer noopener"
                className="thq-body-small"
              >
                {props.link5 ?? (
                  <Fragment>
                    <span className="footer42-text21">FAQs</span>
                  </Fragment>
                )}
              </a>
            </div>
          </div>
          <div className="footer42-credits">
            <div className="thq-divider-horizontal"></div>
            <div className="footer42-row">
              <div className="footer42-container">
                <span className="thq-body-small">© 2024 TeleportHQ</span>
              </div>
              <div className="footer42-footer-links">
                <span className="footer42-text11 thq-body-small">
                  {props.privacyLink ?? (
                    <Fragment>
                      <span className="footer42-text18">Privacy Policy</span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.termsLink ?? (
                    <Fragment>
                      <span className="footer42-text17">
                        Terms and Conditions
                      </span>
                    </Fragment>
                  )}
                </span>
                <span className="thq-body-small">
                  {props.cookiesLink ?? (
                    <Fragment>
                      <span className="footer42-text16">Cookies Policy</span>
                    </Fragment>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
      <style jsx>
        {`
          .footer42-footer7 {
            width: 100%;
            height: auto;
            display: flex;
            overflow: hidden;
            position: relative;
            align-items: center;
            flex-shrink: 0;
            flex-direction: column;
            justify-content: center;
          }
          .footer42-max-width {
            gap: var(--dl-layout-space-threeunits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer42-content {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .footer42-logo1 {
            gap: 24px;
            display: flex;
            overflow: hidden;
            align-items: flex-start;
            flex-direction: column;
          }
          .footer42-logo2 {
            height: 2rem;
          }
          .footer42-links {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-items: flex-start;
          }
          .footer42-credits {
            gap: var(--dl-layout-space-twounits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .footer42-row {
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-shrink: 0;
            justify-content: space-between;
          }
          .footer42-container {
            display: flex;
            align-items: flex-start;
          }
          .footer42-footer-links {
            gap: 24px;
            display: flex;
            align-items: flex-start;
          }
          .footer42-text11 {
            fill: var(--dl-color-theme-neutral-dark);
            color: var(--dl-color-theme-neutral-dark);
          }
          .footer42-text14 {
            display: inline-block;
          }
          .footer42-text15 {
            display: inline-block;
          }
          .footer42-text16 {
            display: inline-block;
          }
          .footer42-text17 {
            display: inline-block;
          }
          .footer42-text18 {
            display: inline-block;
          }
          .footer42-text19 {
            display: inline-block;
          }
          .footer42-text20 {
            display: inline-block;
          }
          .footer42-text21 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .footer42-row {
              gap: var(--dl-layout-space-oneandhalfunits);
              align-items: center;
              flex-direction: column;
              justify-content: center;
            }
          }
          @media (max-width: 479px) {
            .footer42-max-width {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
            .footer42-links {
              flex-direction: column;
            }
            .footer42-footer-links {
              align-items: center;
              flex-direction: column;
              justify-content: center;
            }
          }
        `}
      </style>
    </>
  )
}

Footer42.defaultProps = {
  link4: undefined,
  logoAlt: 'Company Logo',
  logoSrc: 'https://presentation-website-assets.teleporthq.io/logos/logo.png',
  link3: undefined,
  cookiesLink: undefined,
  termsLink: undefined,
  privacyLink: undefined,
  link1: undefined,
  link2: undefined,
  link5: undefined,
}

Footer42.propTypes = {
  link4: PropTypes.element,
  logoAlt: PropTypes.string,
  logoSrc: PropTypes.string,
  link3: PropTypes.element,
  cookiesLink: PropTypes.element,
  termsLink: PropTypes.element,
  privacyLink: PropTypes.element,
  link1: PropTypes.element,
  link2: PropTypes.element,
  link5: PropTypes.element,
}

export default Footer42
