import React, { Fragment } from 'react'

import { useTranslations } from 'next-intl'

import Navbar111 from './navbar111'
import Footer4 from './footer4'

const Component2 = (props) => {
  return (
    <>
      <div className="component2-container">
        <Navbar111
          link1={
            <Fragment>
              <span className="component2-text10">Home</span>
            </Fragment>
          }
          link2={
            <Fragment>
              <span className="component2-text11">About Us</span>
            </Fragment>
          }
          link3={
            <Fragment>
              <span className="component2-text12">Services</span>
            </Fragment>
          }
          link4={
            <Fragment>
              <span className="component2-text13">Portfolio</span>
            </Fragment>
          }
          link5={
            <Fragment>
              <span className="component2-text14">Contact Us</span>
            </Fragment>
          }
          action1={
            <Fragment>
              <span className="component2-text15">Login</span>
            </Fragment>
          }
          action2={
            <Fragment>
              <span className="component2-text16">Sign Up</span>
            </Fragment>
          }
        ></Navbar111>
        <Footer4
          link1={
            <Fragment>
              <span className="component2-text17">Home</span>
            </Fragment>
          }
          link2={
            <Fragment>
              <span className="component2-text18">About Us</span>
            </Fragment>
          }
          link3={
            <Fragment>
              <span className="component2-text19">Services</span>
            </Fragment>
          }
          link4={
            <Fragment>
              <span className="component2-text20">Contact Us</span>
            </Fragment>
          }
          link5={
            <Fragment>
              <span className="component2-text21">FAQs</span>
            </Fragment>
          }
          termsLink={
            <Fragment>
              <span className="component2-text22">Terms and Conditions</span>
            </Fragment>
          }
          cookiesLink={
            <Fragment>
              <span className="component2-text23">Cookies Policy</span>
            </Fragment>
          }
          privacyLink={
            <Fragment>
              <span className="component2-text24">Privacy Policy</span>
            </Fragment>
          }
        ></Footer4>
      </div>
      <style jsx>
        {`
          .component2-container {
            width: 100%;
            height: 400px;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .component2-text10 {
            display: inline-block;
          }
          .component2-text11 {
            display: inline-block;
          }
          .component2-text12 {
            display: inline-block;
          }
          .component2-text13 {
            display: inline-block;
          }
          .component2-text14 {
            display: inline-block;
          }
          .component2-text15 {
            display: inline-block;
          }
          .component2-text16 {
            display: inline-block;
          }
          .component2-text17 {
            display: inline-block;
          }
          .component2-text18 {
            display: inline-block;
          }
          .component2-text19 {
            display: inline-block;
          }
          .component2-text20 {
            display: inline-block;
          }
          .component2-text21 {
            display: inline-block;
          }
          .component2-text22 {
            display: inline-block;
          }
          .component2-text23 {
            display: inline-block;
          }
          .component2-text24 {
            display: inline-block;
          }
        `}
      </style>
    </>
  )
}

export default Component2
